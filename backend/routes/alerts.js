const express = require('express');
const router = express.Router();
const { asyncRoute, normalizeError } = require('../utils/errors');
const { getServers, getServerById } = require('../utils/servers');
const { collectAlertsForServer } = require('../utils/monitoringCollectors');
const { getCachedOrFresh } = require('../utils/monitorCache');

function enrichAlert(alert = {}) {
  const serverId = alert.serverId || '';
  const category = alert.category || 'general';
  const key = alert.key || alert.title || alert.message || 'alert';
  return {
    ...alert,
    serverId,
    category,
    key,
    id: alert.id || `${serverId}:${category}:${key}`
  };
}

router.get('/', asyncRoute(async (req, res) => {
  const servers = getServers();
  const allAlerts = [];
  const concurrency = Math.max(1, Number(process.env.MONITOR_CONCURRENCY || 4));
  let index = 0;

  async function worker() {
    while (index < servers.length) {
      const server = servers[index++];
      try {
        const item = await getCachedOrFresh(`alerts:${server.id}`, Number(process.env.MONITOR_CACHE_ALERTS_MS || 5000), () => collectAlertsForServer(server), { force: req.query.force === '1' });
        allAlerts.push(...(item.data || []));
      } catch (err) {
        const e = normalizeError(err, `alerts for ${server.id}`);
        allAlerts.push(enrichAlert({
          id: `${server.id}-collector-error-${Date.now()}`,
          serverId: server.id,
          serverName: server.name,
          category: 'system',
          severity: 'critical',
          title: `خطا در جمع‌آوری هشدارهای ${server.name}`,
          message: `${e.error}${e.hint ? ' - ' + e.hint : ''}`,
          targetTab: 'settings',
          actionLabel: 'بررسی تنظیمات سرور',
          timestamp: new Date().toISOString(),
          key: 'collector-error',
          raw: e
        }));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, servers.length || 1) }, worker));
  res.json(allAlerts.map(enrichAlert).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))));
}, 'get all alerts'));

router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = getServerById(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'شناسه سرور در تنظیمات وجود ندارد.' });
  const item = await getCachedOrFresh(`alerts:${server.id}`, Number(process.env.MONITOR_CACHE_ALERTS_MS || 5000), () => collectAlertsForServer(server), { force: req.query.force === '1' });
  res.json((item.data || []).map(enrichAlert));
}, 'get server alerts'));

module.exports = router;
