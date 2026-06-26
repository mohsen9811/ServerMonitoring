const express = require('express');
const router = express.Router();
const { executeOnServer } = require('../utils/executor');
const { getMonitoredServices, getAllServicesFromSql, getServiceFromSql } = require('../utils/monitoringCollectors');
const { isSqlEnabled } = require('../utils/features');
const { getCachedOrFresh, clearCache } = require('../utils/monitorCache');
const { getServers, getRawServers, saveServers } = require('../utils/servers');

// دریافت همه سرویس‌ها (برای جستجو)
router.get('/all/:serverId', async (req, res) => {
  const servers = getServers();
  const server = servers.find(s => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  try {
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
  } catch (err) {
    console.error('Get all services error:', err);
    res.status(500).json({ error: err.message });
  }
});

// دریافت فقط سرویس‌های تحت نظارت
router.get('/:serverId', async (req, res) => {
  const servers = getServers();
  const server = servers.find(s => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const monitored = server.monitoredServices || [];
  if (monitored.length === 0) return res.json([]);
  try {
    const ttl = isSqlEnabled(server)
      ? Number(process.env.MONITOR_CACHE_SERVICES_SQL_MS || 3000)
      : Number(process.env.MONITOR_CACHE_SERVICES_MS || 3000);
    const item = await getCachedOrFresh(`services:monitored:${server.id}`, ttl, async () => {
      return await getMonitoredServices(server);
    }, { force: req.query.force === '1' });
    res.json(item.data);
  } catch (err) {
    console.error('Get monitored services error:', err);
    res.status(500).json({ error: err.message });
  }
});

// افزودن سرویس به لیست نظارت
router.post('/:serverId/monitor', async (req, res) => {
  const serviceName = String(req.body?.serviceName || req.body?.name || '').trim();
  const selectedFromList = req.body?.selectedFromList === true;
  if (!serviceName) return res.status(400).json({ error: 'Service name required' });

  let servers = getRawServers();
  const resolvedServers = getServers();
  const index = servers.findIndex(s => s.id === req.params.serverId);
  if (index === -1) return res.status(404).json({ error: 'Server not found' });
  const server = resolvedServers.find(s => s.id === req.params.serverId) || servers[index];

  // وقتی کاربر سرویس را از همان لیست جستجو انتخاب کرده، اسم سرویس از خود سرور آمده و قابل اعتماد است.
  // برای SQL Serverها اعتبارسنجی دوباره با sc queryex در بعضی نسخه‌ها خطای بی‌مورد می‌داد، پس فقط برای ورودی دستی چک سخت انجام می‌دهیم.
  if (!selectedFromList) {
    try {
      if (isSqlEnabled(server)) {
        const svc = await getServiceFromSql(server, serviceName);
        if (!svc || svc.Status === 'NotFound') {
          return res.status(400).json({ error: `Service "${serviceName}" does not exist on SQL server host` });
        }
      } else {
        const script = `Get-Service -Name '${serviceName.replace(/'/g, "''")}' -ErrorAction Stop | Select-Object Name`;
        await executeOnServer(server, script);
      }
    } catch (err) {
      return res.status(400).json({ error: `Service "${serviceName}" does not exist or unreachable: ${err.message}`, hint: err.hint });
    }
  }

  if (!server.monitoredServices) server.monitoredServices = [];
  const exists = server.monitoredServices.some(x => String(x).toLowerCase() === serviceName.toLowerCase());
  if (exists) {
    return res.status(409).json({ error: 'Already monitoring this service' });
  }

  const rawServer = servers[index];
  rawServer.monitoredServices = Array.isArray(rawServer.monitoredServices) ? rawServer.monitoredServices : [];
  rawServer.monitoredServices.push(serviceName);
  servers[index] = rawServer;
  saveServers(servers);
  clearCache(`services:monitored:${server.id}`);
  clearCache(`services:all:${server.id}`);
  clearCache(`alerts:${server.id}`);
  clearCache('live:');
  res.json({ success: true, monitoredServices: server.monitoredServices });
});

// حذف سرویس از لیست نظارت
router.delete('/:serverId/monitor/:serviceName', async (req, res) => {
  let servers = getRawServers();
  const index = servers.findIndex(s => s.id === req.params.serverId);
  if (index === -1) return res.status(404).json({ error: 'Server not found' });
  const server = servers[index];
  const serviceName = req.params.serviceName;
  if (server.monitoredServices) {
    server.monitoredServices = server.monitoredServices.filter(s => s !== serviceName);
    servers[index] = server;
    saveServers(servers);
    clearCache(`services:monitored:${server.id}`);
    clearCache(`alerts:${server.id}`);
    clearCache('live:');
  }
  res.json({ success: true });
});

// کنترل سرویس با پشتیبانی از Force (توقف/ریستارت اجباری)
router.post('/:serverId/action', async (req, res) => {
  const servers = getServers();
  const server = servers.find(s => s.id === req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const { service, action, force = false } = req.body;
  if (!service || !['Start', 'Stop', 'Restart'].includes(action))
    return res.status(400).json({ error: 'Invalid action' });

  try {
    // Service actions are intentionally executed through WinRM/PowerShell for ALL servers,
    // including SQL-enabled servers.
    // Reason: xp_cmdshell runs under the SQL Server service account and usually cannot
    // start/stop Windows services safely; it also has security and permission limitations.
    // SQL is still useful for SQL metrics/backups, but Windows service control belongs to WinRM.
    let script = '';
    if (action === 'Stop') {
      if (force) {
        // Force Stop: متوقف کردن سرویس و وابسته‌های آن
        script = `
          $svc = Get-Service -Name "${service}" -ErrorAction Stop
          Stop-Service -InputObject $svc -Force -ErrorAction Stop
          Start-Sleep -Seconds 3
          $svc = Get-Service -Name "${service}"
          [PSCustomObject]@{ Name = $svc.Name; Status = $svc.Status.ToString() } | ConvertTo-Json
        `;
      } else {
        // Stop معمولی با sc.exe
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
        // Force Restart: Stop-Force + Start
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
        // Restart معمولی با sc.exe
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
    let cleanResult = result;
    // پاکسازی خطاهای CLIXML
    if (result && result.includes('<Objs')) {
      const match = result.match(/<S S="Error">(.*?)<\/S>/);
      if (match) throw new Error(match[1].replace(/_x000D__x000A_/g, ' ').trim());
    }
    if (cleanResult && (cleanResult.includes('<S S="Error">') || cleanResult.toLowerCase().includes('fail'))) {
      throw new Error(cleanResult.replace(/<[^>]*>/g, '').trim());
    }
    const data = JSON.parse(cleanResult);
    clearCache(`services:monitored:${server.id}`);
    clearCache(`services:all:${server.id}`);
    clearCache(`alerts:${server.id}`);
    clearCache('live:');
    res.json(data);
  } catch (err) {
    console.error('Service action error:', err);
    let errorMsg = err.message;
    if (errorMsg.includes('1051') || errorMsg.includes('dependent on')) {
      errorMsg = '⚠️ این سرویس دارای وابستگی است. لطفاً از دکمه "توقف اجباری" یا "ریستارت اجباری" استفاده کنید.';
    }
    res.status(500).json({ error: errorMsg });
  }
});

module.exports = router;