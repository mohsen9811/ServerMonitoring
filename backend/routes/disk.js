const express = require('express');
const router = express.Router();
const { asyncRoute } = require('../utils/errors');
const { getServerById } = require('../utils/servers');
const { getDisks } = require('../utils/monitoringCollectors');
const { getCachedOrFresh } = require('../utils/monitorCache');
const { isSqlEnabled } = require('../utils/features');

const DISK_TTL_MS = Math.max(3000, Number(process.env.MONITOR_CACHE_DISK_MS || 10000));
const SQL_DISK_TTL_MS = Math.max(3000, Number(process.env.MONITOR_CACHE_DISK_SQL_MS || 10000));

router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = getServerById(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'شناسه سرور در تنظیمات وجود ندارد.' });
  const ttl = isSqlEnabled(server) ? SQL_DISK_TTL_MS : DISK_TTL_MS;
  const item = await getCachedOrFresh(`disk:${server.id}`, ttl, () => getDisks(server), { force: req.query.force === '1' });
  res.json(item.data || []);
}, 'get dynamic disks'));

module.exports = router;
