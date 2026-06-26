const express = require('express');
const router = express.Router();
const { executeOnServer } = require('../utils/executor');
const { getMonitoredServices, getAllServicesFromSql, getServiceFromSql } = require('../utils/monitoringCollectors');
const { isSqlEnabled } = require('../utils/features');
const { getCachedOrFresh, clearCache } = require('../utils/monitorCache');
const { getServers, getRawServers, saveServers } = require('../utils/servers');
const { asyncRoute, sendError } = require('../utils/errors');

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
  const script = `Get-Service | Select-Object Name, DisplayName, Status | ConvertTo-Json -Depth 3`;
  const item = await getCachedOrFresh(`services:all:${server.id}`, Number(process.env.MONITOR_CACHE_SERVICES_ALL_MS || 10000), async () => {
    if (isSqlEnabled(server)) {
      return await getAllServicesFromSql(server);
    }
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
    if (isSqlEnabled(server)) {
      const svc = await getServiceFromSql(server, serviceName);
      if (!svc || svc.Status === 'NotFound') {
        return res.status(400).json({ error: `Service "${serviceName}" does not exist on SQL server host` });
      }
    } else {
      const script = `Get-Service -Name '${serviceName.replace(/'/g, "''")}' -ErrorAction Stop | Select-Object Name`;
      try {
        await executeOnServer(server, script);
      } catch (err) {
        return res.status(400).json({ error: `Service "${serviceName}" does not exist or unreachable: ${err.message}`, hint: err.hint });
      }
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
  const { service, action, force = false } = req.body;
  if (!service || !['Start', 'Stop', 'Restart'].includes(action))
    return res.status(400).json({ error: 'Invalid action' });

  let script = '';
  if (action === 'Stop') {
    if (force) {
      script = `
        $svc = Get-Service -Name "${service}" -ErrorAction Stop
        Stop-Service -InputObject $svc -Force -ErrorAction Stop
        Start-Sleep -Seconds 3
        $svc = Get-Service -Name "${service}"
        [PSCustomObject]@{ Name = $svc.Name; Status = $svc.Status.ToString() } | ConvertTo-Json
      `;
    } else {
      script = `
        $result = sc.exe stop "${service}" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "sc.exe stop failed: $result" }
        Start-Sleep -Seconds 2
        $svc = Get-Service -Name "${service}"
        [PSCustomObject]@{ Name = $svc.Name; Status = $svc.Status.ToString() } | ConvertTo-Json
      `;
    }
  } else if (action === 'Start') {
    script = `
      $result = sc.exe start "${service}" 2>&1
      if ($LASTEXITCODE -ne 0) { throw "sc.exe start failed: $result" }
      Start-Sleep -Seconds 2
      $svc = Get-Service -Name "${service}"
      [PSCustomObject]@{ Name = $svc.Name; Status = $svc.Status.ToString() } | ConvertTo-Json
    `;
  } else if (action === 'Restart') {
    if (force) {
      script = `
        $svc = Get-Service -Name "${service}" -ErrorAction Stop
        Stop-Service -InputObject $svc -Force -ErrorAction Stop
        Start-Sleep -Seconds 3
        Start-Service -InputObject $svc -ErrorAction Stop
        Start-Sleep -Seconds 2
        $svc = Get-Service -Name "${service}"
        [PSCustomObject]@{ Name = $svc.Name; Status = $svc.Status.ToString() } | ConvertTo-Json
      `;
    } else {
      script = `
        $stopResult = sc.exe stop "${service}" 2>&1
        if ($LASTEXITCODE -ne 0 -and $stopResult -notmatch "not started") { throw "sc.exe stop failed: $stopResult" }
        Start-Sleep -Seconds 3
        $startResult = sc.exe start "${service}" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "sc.exe start failed: $startResult" }
        Start-Sleep -Seconds 2
        $svc = Get-Service -Name "${service}"
        [PSCustomObject]@{ Name = $svc.Name; Status = $svc.Status.ToString() } | ConvertTo-Json
      `;
    }
  }

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