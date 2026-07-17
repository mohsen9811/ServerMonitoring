const express = require('express');
const router = express.Router();
const { asyncRoute } = require('../utils/errors');
const { getServerById } = require('../utils/servers');
const { getSystemMetrics } = require('../utils/monitoringCollectors');
const { getCachedOrFresh } = require('../utils/monitorCache');
const { isSqlEnabled } = require('../utils/features');
const { recordMetric, getMetricHistory } = require('../utils/metricsHistory');

const SYSTEM_TTL_MS = Math.max(3000, Number(process.env.MONITOR_CACHE_SYSTEM_MS || 3000));
const SQL_SYSTEM_TTL_MS = Math.max(3000, Number(process.env.MONITOR_CACHE_SYSTEM_SQL_MS || 5000));

router.get('/:serverId/history', asyncRoute(async (req, res) => {
  const server = getServerById(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND' });
  res.json({
    serverId: server.id,
    rangeMinutes: Math.max(1, Math.min(Number(req.query.minutes || 60), 1440)),
    samples: getMetricHistory(server.id, { minutes: req.query.minutes, maxPoints: req.query.maxPoints })
  });
}, 'get system metric history'));

router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = getServerById(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND' });
  const ttl = isSqlEnabled(server) ? SQL_SYSTEM_TTL_MS : SYSTEM_TTL_MS;
  const item = await getCachedOrFresh(`system:${server.id}`, ttl, () => getSystemMetrics(server), { force: req.query.force === '1' });
  recordMetric(server.id, item.data, item.updatedAt);
  res.json({ ...item.data, updatedAt: item.updatedAt, stale: item.stale, fromCache: item.fromCache });
}, 'get system metrics'));

module.exports = router;
