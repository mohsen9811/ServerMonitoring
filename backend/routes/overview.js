const express = require('express');
const router = express.Router();
const { asyncRoute, normalizeError } = require('../utils/errors');
const { getServerById } = require('../utils/servers');
const { getCachedOrFresh } = require('../utils/monitorCache');
const {
  getSystemMetrics,
  getDisks,
  getMonitoredServices,
  getSqlJobs,
  getDatabases,
  collectAlertsForServer
} = require('../utils/monitoringCollectors');
const { isSqlEnabled, isIisEnabled } = require('../utils/features');
const { recordMetric, getMetricHistory } = require('../utils/metricsHistory');

function resultData(result, fallback) {
  return result.status === 'fulfilled' ? (result.value.data ?? fallback) : fallback;
}

function healthScore({ system, disks, services, jobs, databases, alerts }) {
  let score = 100;
  if (system.cpuPercent >= 90) score -= 18;
  else if (system.cpuPercent >= 75) score -= 8;
  if (system.ramPercent >= 90) score -= 18;
  else if (system.ramPercent >= 80) score -= 8;
  score -= Math.min(24, disks.filter((item) => item.UsedPercent >= 90).length * 12);
  score -= Math.min(20, services.filter((item) => item.Status !== 'Running').length * 7);
  score -= Math.min(16, jobs.filter((item) => item.last_run_status === 'Failed').length * 5);
  score -= Math.min(20, databases.filter((item) => String(item.status).toLowerCase() !== 'online' || item.is_synchronized === false).length * 8);
  score -= Math.min(24, alerts.filter((item) => item.severity === 'critical').length * 6);
  return Math.max(0, Math.round(score));
}

router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = getServerById(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND' });
  const force = req.query.force === '1';
  const cached = (key, ttl, loader) => getCachedOrFresh(key, ttl, loader, { force });
  const tasks = [
    cached(`system:${server.id}`, 3000, () => getSystemMetrics(server)),
    cached(`disk:${server.id}`, 10000, () => getDisks(server)),
    cached(`services:monitored:${server.id}`, 5000, () => getMonitoredServices(server)),
    isSqlEnabled(server) ? cached(`jobs:${server.id}`, 5000, () => getSqlJobs(server)) : Promise.resolve({ data: [] }),
    isSqlEnabled(server) ? cached(`databases:${server.id}`, 15000, () => getDatabases(server)) : Promise.resolve({ data: [] }),
    cached(`alerts:${server.id}`, 10000, () => collectAlertsForServer(server))
  ];
  const settled = await Promise.allSettled(tasks);
  const [systemResult, disksResult, servicesResult, jobsResult, databasesResult, alertsResult] = settled;
  const system = resultData(systemResult, {});
  const disks = resultData(disksResult, []);
  const services = resultData(servicesResult, []);
  const jobs = resultData(jobsResult, []);
  const databases = resultData(databasesResult, []);
  const alerts = resultData(alertsResult, []);
  if (systemResult.status === 'fulfilled') recordMetric(server.id, system, systemResult.value.updatedAt);

  const failures = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const section = ['system', 'disks', 'services', 'jobs', 'databases', 'alerts'][index];
    const error = normalizeError(result.reason, `overview ${section}`);
    return [{ section, code: error.code, message: error.error }];
  });
  const score = healthScore({ system, disks, services, jobs, databases, alerts });
  res.json({
    server: {
      id: server.id,
      name: server.name,
      host: server.host,
      features: { sql: isSqlEnabled(server), iis: isIisEnabled(server), winrm: server.features?.winrm !== false }
    },
    health: {
      score,
      state: failures.some((item) => item.section === 'system') ? 'offline' : score >= 85 ? 'healthy' : score >= 65 ? 'degraded' : 'critical',
      failures
    },
    system,
    disks,
    services,
    jobs,
    databases,
    alerts,
    history: getMetricHistory(server.id, { minutes: req.query.minutes || 60, maxPoints: 180 }),
    updatedAt: new Date().toISOString()
  });
}, 'get operational overview'));

module.exports = router;
