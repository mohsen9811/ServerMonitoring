const express = require('express');
const router = express.Router();
const { getServers } = require('../utils/servers');
const { collectAlertsForServer } = require('../utils/monitoringCollectors');
const { getCachedOrFresh } = require('../utils/monitorCache');
const { normalizeError } = require('../utils/errors');

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

const REFRESH_MS = Math.max(3000, Number(process.env.MONITOR_REFRESH_MS || 3000));
const SSE_MS = Math.max(3000, Number(process.env.MONITOR_SSE_MS || REFRESH_MS));

async function collectAllAlerts() {
  const servers = getServers();
  const out = [];
  const concurrency = Math.max(1, Number(process.env.MONITOR_CONCURRENCY || 3));
  let index = 0;

  async function worker() {
    while (index < servers.length) {
      const server = servers[index++];
      try {
        const alerts = (await collectAlertsForServer(server)).map(enrichAlert);
        out.push(...alerts.map(enrichAlert));
      } catch (err) {
        const e = normalizeError(err, `live alerts for ${server.id}`);
        out.push(enrichAlert({
          id: `${server.id}-collector-error`,
          serverId: server.id,
          serverName: server.name,
          category: 'system',
          severity: 'critical',
          title: `خطا در پایش ${server.name}`,
          message: `${e.error}${e.hint ? ' - ' + e.hint : ''}`,
          targetTab: 'settings',
          actionLabel: 'بررسی تنظیمات',
          timestamp: new Date().toISOString(),
          raw: e
        }));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, servers.length || 1) }, worker));
  return out.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

async function getLiveSnapshot(force = false) {
  const item = await getCachedOrFresh('live:alerts:all', REFRESH_MS, collectAllAlerts, { force });
  const alerts = Array.isArray(item.data) ? item.data : [];
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning = alerts.filter(a => a.severity === 'warning').length;
  return {
    updatedAt: item.updatedAt,
    stale: Boolean(item.stale),
    refreshMs: REFRESH_MS,
    counts: { total: alerts.length, critical, warning },
    alerts
  };
}

router.get('/status', async (req, res, next) => {
  try {
    res.json(await getLiveSnapshot(req.query.force === '1'));
  } catch (err) { next(err); }
});

router.get('/events', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  let closed = false;
  req.on('close', () => { closed = true; clearInterval(timer); });

  async function send() {
    if (closed) return;
    try {
      const data = await getLiveSnapshot(false);
      res.write(`event: status\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  }

  const timer = setInterval(send, SSE_MS);
  await send();
});

module.exports = router;
