const express = require('express');
const router = express.Router();
const { asyncRoute, sendError } = require('../utils/errors');
const { getServerById } = require('../utils/servers');
const { isSqlEnabled, sqlDisabledResponse } = require('../utils/features');
const { getSqlJobs, getSqlJobHistory, getSqlJobDetails, runSqlJobAction } = require('../utils/monitoringCollectors');
const { getCachedOrFresh, clearCache } = require('../utils/monitorCache');

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

function readJobName(req) {
  return decodeURIComponent(
    req.params.jobName ||
    req.params.name ||
    req.query.jobName ||
    req.query.name ||
    req.body?.jobName ||
    req.body?.name ||
    req.body?.job ||
    req.body?.JobName ||
    ''
  ).trim();
}

function normalizeJobAction(value) {
  const raw = String(value || '').trim().toLowerCase();
  const map = {
    start: 'Start',
    run: 'Start',
    startjob: 'Start',
    runjob: 'Start',
    stop: 'Stop',
    stopjob: 'Stop',
    restart: 'Restart',
    restartjob: 'Restart',
    enable: 'Enable',
    enabled: 'Enable',
    active: 'Enable',
    disable: 'Disable',
    disabled: 'Disable',
    inactive: 'Disable'
  };
  return map[raw] || '';
}

function readJobAction(req) {
  return normalizeJobAction(
    req.params.action ||
    req.query.action ||
    req.body?.action ||
    req.body?.jobAction ||
    req.body?.operation ||
    ''
  );
}

function validateJobAction(req, res) {
  const jobName = readJobName(req);
  const action = readJobAction(req);

  if (!jobName || !action) {
    res.status(400).json({
      error: 'Invalid job or action',
      code: 'VALIDATION_ERROR',
      hint: 'jobName و action الزامی هستند. action باید یکی از Start، Stop، Restart، Enable یا Disable باشد.',
      received: {
        jobName: jobName || null,
        action: req.params.action || req.query.action || req.body?.action || null
      }
    });
    return null;
  }

  return { jobName, action };
}

async function handleJobAction(req, res) {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));

  const input = validateJobAction(req, res);
  if (!input) return;

  try {
    const result = await runSqlJobAction(server, input.jobName, input.action);
    clearCache(`jobs:${server.id}`);
    clearCache(`alerts:${server.id}`);
    clearCache('live:');
    res.json(result);
  } catch (err) {
    sendError(res, err, 500, 'sql job action');
  }
}

router.get('/:serverId/details/:jobName', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));
  const details = await getSqlJobDetails(server, readJobName(req));
  res.json(details);
}, 'get sql job details'));

router.get('/:serverId/history/:jobName', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));
  const history = await getSqlJobHistory(server, readJobName(req), req.query.top || 50);
  res.json(history);
}, 'get sql job history'));

// Compatibility aliases for several front-end builds.
router.get('/:serverId/job/:jobName/details', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));
  const details = await getSqlJobDetails(server, readJobName(req));
  res.json(details);
}, 'get sql job details alias'));

router.get('/:serverId/job/:jobName/history', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));
  const history = await getSqlJobHistory(server, readJobName(req), req.query.top || 50);
  res.json(history);
}, 'get sql job history alias'));

router.post('/:serverId/action', handleJobAction);
router.post('/:serverId/job/action', handleJobAction);
router.post('/:serverId/jobs/action', handleJobAction);
router.post('/:serverId/:jobName/action', handleJobAction);
router.post('/:serverId/:jobName/:action', handleJobAction);
router.post('/:serverId/job/:jobName/:action', handleJobAction);

router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isSqlEnabled(server)) return res.json([]);
  const item = await getCachedOrFresh(`jobs:${server.id}`, Number(process.env.MONITOR_CACHE_JOBS_MS || 3000), () => getSqlJobs(server), { force: req.query.force === '1' });
  res.json(item.data || []);
}, 'get sql jobs'));

module.exports = router;
