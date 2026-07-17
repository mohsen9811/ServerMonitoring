const express = require('express');
const router = express.Router();
const { asyncRoute } = require('../utils/errors');
const { getServerById } = require('../utils/servers');
const { isSqlEnabled, sqlDisabledResponse } = require('../utils/features');
const { getDatabases, getDatabaseDetails } = require('../utils/monitoringCollectors');
const { getCachedOrFresh } = require('../utils/monitorCache');

function requireServer(req, res) {
  const server = getServerById(req.params.serverId);
  if (!server) {
    res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'شناسه سرور در تنظیمات وجود ندارد.' });
    return null;
  }
  return server;
}


router.get('/:serverId/details/:databaseName', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));
  const details = await getDatabaseDetails(server, req.params.databaseName);
  res.json(details);
}, 'get database details'));

router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.json([]);
  const item = await getCachedOrFresh(`databases:${server.id}`, Number(process.env.MONITOR_CACHE_DATABASES_MS || 15000), () => getDatabases(server), { force: req.query.force === '1' });
  res.json(item.data || []);
}, 'get databases and HA state'));

module.exports = router;
