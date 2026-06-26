const express = require('express');
const router = express.Router();
const { asyncRoute } = require('../utils/errors');
const { getServerById } = require('../utils/servers');
const { isSqlEnabled, sqlDisabledResponse } = require('../utils/features');
const { getLinkedServers, getLinkedServersWithStatus, getLinkedServerStatus } = require('../utils/monitoringCollectors');

function requireServer(req, res) {
  const server = getServerById(req.params.serverId);
  if (!server) {
    res.status(404).json({
      error: 'Server not found',
      code: 'SERVER_NOT_FOUND',
      hint: 'شناسه سرور در تنظیمات وجود ندارد.'
    });
    return null;
  }
  return server;
}

function getLinkedNameFromRequest(req) {
  const raw =
    req.params.linkedName ||
    req.params.name ||
    req.query.linkedName ||
    req.query.name ||
    req.query.server ||
    req.body?.linkedName ||
    req.body?.linkedServerName ||
    req.body?.server ||
    req.body?.name ||
    '';
  return decodeURIComponent(String(raw || '')).trim();
}

function requireLinkedName(req, res) {
  const linkedName = getLinkedNameFromRequest(req);
  if (!linkedName) {
    res.status(400).json({
      error: 'Linked Server name is required',
      code: 'VALIDATION_ERROR',
      hint: 'نام Linked Server باید ارسال شود. کلیدهای قابل قبول: linkedName، linkedServerName، name یا server.'
    });
    return null;
  }
  return linkedName;
}

// Metadata-only endpoint. این مسیر فقط تعریف‌ها را می‌دهد و هیچ Connected/Failed واقعی اعلام نمی‌کند.
router.get('/:serverId/meta', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.json([]);
  const linked = await getLinkedServers(server);
  res.json(linked);
}, 'list linked server metadata'));

// Live endpoint. وضعیت نهایی فقط با تست واقعی SQL ساخته می‌شود.
router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.json([]);
  const linked = await getLinkedServersWithStatus(server);
  res.json(linked);
}, 'list linked servers with live SQL status'));

// Test all یا test one براساس body.
router.post('/:serverId/test', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.json([]);
  const linkedName = getLinkedNameFromRequest(req);

  if (linkedName) {
    const result = await getLinkedServerStatus(server, linkedName);
    return res.json(result);
  }

  const results = await getLinkedServersWithStatus(server);
  res.json(results);
}, 'test linked servers'));

router.get('/:serverId/test/:linkedName', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));
  const linkedName = requireLinkedName(req, res);
  if (!linkedName) return;
  const result = await getLinkedServerStatus(server, linkedName);
  res.json(result);
}, 'test one linked server by GET'));

router.post('/:serverId/test/:linkedName', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));
  const linkedName = requireLinkedName(req, res);
  if (!linkedName) return;
  const result = await getLinkedServerStatus(server, linkedName);
  res.json(result);
}, 'test one linked server by POST'));

// Compatibility URL shapes.
router.post('/:serverId/:linkedName/test', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));
  const linkedName = requireLinkedName(req, res);
  if (!linkedName) return;
  const result = await getLinkedServerStatus(server, linkedName);
  res.json(result);
}, 'test one linked server compatibility'));

module.exports = router;
