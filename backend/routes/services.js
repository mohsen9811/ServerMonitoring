const express = require('express');
const router = express.Router();
const { executeOnServer } = require('../utils/executor');
const { getMonitoredServices } = require('../utils/monitoringCollectors');
const { getCachedOrFresh, clearCache } = require('../utils/monitorCache');
const { getServers, getRawServers, saveServers } = require('../utils/servers');
const { asyncRoute, sendError } = require('../utils/errors');
const { isSqlEnabled } = require('../utils/features');

function psString(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function findServer(id, includeResolved = true) {
  const servers = includeResolved ? getServers() : getRawServers();
  const idx = servers.findIndex(s => s.id === id);
  if (idx === -1) return null;
  return { index: idx, server: servers[idx], all: servers };
}

// دریافت همه سرویس‌ها (برای جستجو)
router.get('/all/:serverId', asyncRoute(async (req, res) => {
  const found = findServer(req.params.serverId);
  if (!found) return res.status(404).json({ error: 'Server not found' });
  const { server } = found;
  const script = `Get-Service | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json -Depth 3`;
  const item = await getCachedOrFresh(`services:all:${server.id}`, Number(process.env.MONITOR_CACHE_SERVICES_ALL_MS || 10000), async () => {
    const result = await executeOnServer(server, script);
    const data = result ? JSON.parse(result) : [];
    return Array.isArray(data) ? data : [data];
  }, { force: req.query.force === '1' });
  res.json(item.data);
}, 'get all services'));

// دریافت فقط سرویس‌های تحت نظارت
router.get('/:serverId', asyncRoute(async (req, res) => {
  const found = findServer(req.params.serverId);
  if (!found) return res.status(404).json({ error: 'Server not found' });
  const { server } = found;
  const monitored = server.monitoredServices || [];
  if (monitored.length === 0) return res.json([]);
  const ttl = isSqlEnabled(server)
    ? Number(process.env.MONITOR_CACHE_SERVICES_SQL_MS || 3000)
    : Number(process.env.MONITOR_CACHE_SERVICES_MS || 3000);
  const item = await getCachedOrFresh(`services:monitored:${server.id}`, ttl, async () => {
    return await getMonitoredServices(server);
  }, { force: req.query.force === '1' });
  res.json(item.data);
}, 'get monitored services'));

// افزودن سرویس به لیست نظارت
router.post('/:serverId/monitor', asyncRoute(async (req, res) => {
  const serviceName = String(req.body?.serviceName || req.body?.name || '').trim();
  const selectedFromList = req.body?.selectedFromList === true;
  if (!serviceName) return res.status(400).json({ error: 'Service name required' });

  const rawFound = findServer(req.params.serverId, false);
  if (!rawFound) return res.status(404).json({ error: 'Server not found' });
  const resolvedFound = findServer(req.params.serverId);
  if (!resolvedFound) return res.status(404).json({ error: 'Server not found' });
  const server = resolvedFound.server;

  if (!selectedFromList) {
    const script = `Get-Service -Name '${serviceName.replace(/'/g, "''")}' -ErrorAction Stop | Select-Object Name`;
    try {
      await executeOnServer(server, script);
    } catch (err) {
      return res.status(400).json({ error: `Service "${serviceName}" does not exist or unreachable: ${err.message}`, hint: err.hint });
    }
  }

  if (!server.monitoredServices) server.monitoredServices = [];
  if (server.monitoredServices.some(x => String(x).toLowerCase() === serviceName.toLowerCase())) {
    return res.status(409).json({ error: 'Already monitoring this service' });
  }

  const rawServer = rawFound.all[rawFound.index];
  rawServer.monitoredServices = Array.isArray(rawServer.monitoredServices) ? rawServer.monitoredServices : [];
  rawServer.monitoredServices.push(serviceName);
  rawFound.all[rawFound.index] = rawServer;
  saveServers(rawFound.all);
  clearCache(`services:monitored:${server.id}`);
  clearCache(`services:all:${server.id}`);
  clearCache(`alerts:${server.id}`);
  clearCache('live:');
  res.json({ success: true, monitoredServices: server.monitoredServices });
}, 'add monitored service'));

// حذف سرویس از لیست نظارت
router.delete('/:serverId/monitor/:serviceName', asyncRoute(async (req, res) => {
  const found = findServer(req.params.serverId, false);
  if (!found) return res.status(404).json({ error: 'Server not found' });
  const serviceName = req.params.serviceName;
  const rawServer = found.all[found.index];
  if (rawServer.monitoredServices) {
    rawServer.monitoredServices = rawServer.monitoredServices.filter(s => s !== serviceName);
    found.all[found.index] = rawServer;
    saveServers(found.all);
    clearCache(`services:monitored:${rawServer.id}`);
    clearCache(`alerts:${rawServer.id}`);
    clearCache('live:');
  }
  res.json({ success: true });
}, 'remove monitored service'));

// کنترل سرویس با پشتیبانی از Force (توقف/ریستارت اجباری)
router.post('/:serverId/action', asyncRoute(async (req, res) => {
  const found = findServer(req.params.serverId);
  if (!found) return res.status(404).json({ error: 'Server not found' });
  const { server } = found;
  const service = String(req.body?.service || '').trim();
  const actionMap = { start: 'Start', stop: 'Stop', restart: 'Restart', enable: 'Enable', disable: 'Disable' };
  const action = actionMap[String(req.body?.action || '').trim().toLowerCase()];
  const force = req.body?.force === true;
  if (!service || !action) {
    return res.status(400).json({
      error: 'Invalid service action',
      code: 'VALIDATION_ERROR',
      hint: 'نام سرویس و یکی از عملیات Start، Stop، Restart، Enable یا Disable الزامی است.'
    });
  }

  const safeService = psString(service);

  let script = '';
  if (action === 'Stop') {
    if (force) {
      script = `
        $svc = Get-Service -Name ${safeService} -ErrorAction Stop
        Stop-Service -InputObject $svc -Force -ErrorAction Stop
        $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(12))
      `;
    } else {
      script = `
        $svc = Get-Service -Name ${safeService} -ErrorAction Stop
        Stop-Service -InputObject $svc -ErrorAction Stop
        $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(12))
      `;
    }
  } else if (action === 'Start') {
    script = `
      $svc = Get-Service -Name ${safeService} -ErrorAction Stop
      if ($svc.StartType -eq 'Disabled') { throw 'Service is disabled; enable it before starting.' }
      Start-Service -InputObject $svc -ErrorAction Stop
      $svc.WaitForStatus('Running', [TimeSpan]::FromSeconds(12))
    `;
  } else if (action === 'Restart') {
    if (force) {
      script = `
        $svc = Get-Service -Name ${safeService} -ErrorAction Stop
        if ($svc.StartType -eq 'Disabled') { throw 'Service is disabled; enable it before restarting.' }
        Stop-Service -InputObject $svc -Force -ErrorAction Stop
        $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(12))
        Start-Service -InputObject $svc -ErrorAction Stop
        $svc.WaitForStatus('Running', [TimeSpan]::FromSeconds(12))
      `;
    } else {
      script = `
        $svc = Get-Service -Name ${safeService} -ErrorAction Stop
        if ($svc.StartType -eq 'Disabled') { throw 'Service is disabled; enable it before restarting.' }
        if ($svc.Status -ne 'Stopped') {
          Stop-Service -InputObject $svc -ErrorAction Stop
          $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(12))
        }
        Start-Service -InputObject $svc -ErrorAction Stop
        $svc.WaitForStatus('Running', [TimeSpan]::FromSeconds(12))
      `;
    }
  } else if (action === 'Enable') {
    script = `Set-Service -Name ${safeService} -StartupType Automatic -ErrorAction Stop`;
  } else if (action === 'Disable') {
    script = `
      $svc = Get-Service -Name ${safeService} -ErrorAction Stop
      if ($svc.Status -ne 'Stopped') { throw 'Stop the service before disabling it.' }
      Set-Service -Name ${safeService} -StartupType Disabled -ErrorAction Stop
    `;
  }

  script += `
    $svc = Get-Service -Name ${safeService} -ErrorAction Stop
    [PSCustomObject]@{
      Name = $svc.Name
      DisplayName = $svc.DisplayName
      Status = $svc.Status.ToString()
      StartType = $svc.StartType.ToString()
      CanStop = $svc.CanStop
      CanPauseAndContinue = $svc.CanPauseAndContinue
    } | ConvertTo-Json -Compress
  `;

  const result = await executeOnServer(server, script);
  // Clean CLIXML errors
  if (result && result.includes('<Objs')) {
    const match = result.match(/<S S="Error">(.*?)<\/S>/);
    if (match) throw new Error(match[1].replace(/_x000D__x000A_/g, ' ').trim());
  }
  if (result && (result.includes('<S S="Error">') || result.toLowerCase().includes('fail'))) {
    throw new Error(result.replace(/<[^>]*>/g, '').trim());
  }

  const data = JSON.parse(result);
  clearCache(`services:monitored:${server.id}`);
  clearCache(`services:all:${server.id}`);
  clearCache(`alerts:${server.id}`);
  clearCache('live:');
  res.json(data);
}, 'service action'));

module.exports = router;
