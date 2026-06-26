const express = require('express');
const router = express.Router();
const { asyncRoute } = require('../utils/errors');
const { getServerById } = require('../utils/servers');
const { executeOnServer } = require('../utils/executor');
const { getCachedOrFresh, clearCache } = require('../utils/monitorCache');
const { isIisEnabled, iisDisabledResponse } = require('../utils/features');

const IIS_TTL_MS = Math.max(5000, Number(process.env.MONITOR_CACHE_IIS_MS || 45000));

function requireServer(req, res) {
  const server = getServerById(req.params.serverId);
  if (!server) {
    res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'شناسه سرور در تنظیمات وجود ندارد.' });
    return null;
  }
  return server;
}

async function readIis(server) {
  const script = `
    $ErrorActionPreference = 'Stop'
    $result = [ordered]@{ sites=@(); appPools=@(); source=''; iisInstalled=$false }
    try {
      Import-Module WebAdministration -ErrorAction Stop
      $result.source = 'WebAdministration'
      $result.iisInstalled = $true
      $result.sites = @(Get-Website | Sort-Object Name | ForEach-Object {
        [PSCustomObject]@{
          Name=$_.Name; Id=$_.Id; State=$_.State.ToString(); PhysicalPath=$_.PhysicalPath;
          Bindings=(($_.Bindings.Collection | ForEach-Object { $_.bindingInformation }) -join ', ')
        }
      })
      $result.appPools = @(Get-ChildItem IIS:\AppPools | Sort-Object Name | ForEach-Object {
        [PSCustomObject]@{ Name=$_.Name; State=$_.State.ToString(); ManagedRuntimeVersion=$_.managedRuntimeVersion; ManagedPipelineMode=$_.managedPipelineMode.ToString() }
      })
    } catch {
      $appcmd = Join-Path $env:windir 'System32\\inetsrv\\appcmd.exe'
      if (-not (Test-Path $appcmd)) {
        $result.iisInstalled = $false
        $result.error = 'IIS/WebAdministration روی این سرور نصب یا فعال نیست.'
      } else {
        $result.source = 'appcmd'
        $result.iisInstalled = $true
        $sitesRaw = & $appcmd list site /xml
        if ($sitesRaw) {
          [xml]$sitesXml = '<root>' + ($sitesRaw -join '') + '</root>'
          $result.sites = @($sitesXml.root.SITE | ForEach-Object {
            [PSCustomObject]@{ Name=$_.NAME; Id=$_.ID; State=$_.state; PhysicalPath=''; Bindings=$_.bindings }
          })
        }
        $poolsRaw = & $appcmd list apppool /xml
        if ($poolsRaw) {
          [xml]$poolsXml = '<root>' + ($poolsRaw -join '') + '</root>'
          $result.appPools = @($poolsXml.root.APPPOOL | ForEach-Object {
            [PSCustomObject]@{ Name=$_.'APPPOOL.NAME'; State=$_.state; ManagedRuntimeVersion=''; ManagedPipelineMode='' }
          })
        }
      }
    }
    $result | ConvertTo-Json -Depth 6 -Compress
  `;
  const result = await executeOnServer(server, script);
  return result ? JSON.parse(result) : { sites: [], appPools: [], iisInstalled: false };
}

router.get('/:serverId', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isIisEnabled(server)) return res.json(iisDisabledResponse(server));
  const item = await getCachedOrFresh(`iis:${server.id}`, IIS_TTL_MS, () => readIis(server), { force: req.query.force === '1' });
  res.json({ ...item.data, updatedAt: item.updatedAt, stale: item.stale, fromCache: item.fromCache });
}, 'get iis state'));

router.post('/:serverId/action', asyncRoute(async (req, res) => {
  const server = requireServer(req, res);
  if (!server) return;
  if (!isIisEnabled(server)) return res.status(400).json({ error: 'IIS برای این سرور فعال نیست', code: 'IIS_DISABLED', hint: 'در تنظیمات سرور، گزینه IIS را فقط برای Web Server فعال کنید.' });

  const { type, name, action } = req.body || {};
  const normalizedType = String(type || '').toLowerCase();
  const normalizedAction = String(action || '').toLowerCase();
  const safeName = String(name || '').replace(/'/g, "''");

  if (!safeName || !['site', 'apppool'].includes(normalizedType) || !['start', 'stop', 'restart', 'recycle'].includes(normalizedAction)) {
    return res.status(400).json({ error: 'Invalid IIS action', hint: 'type باید site/apppool و action باید start/stop/restart/recycle باشد.' });
  }
  if (normalizedType === 'site' && normalizedAction === 'recycle') {
    return res.status(400).json({ error: 'Recycle برای Website معتبر نیست؛ برای App Pool استفاده کن.' });
  }

  const script = `
    $ErrorActionPreference = 'Stop'
    $type = '${normalizedType}'
    $name = '${safeName}'
    $action = '${normalizedAction}'
    $result = [ordered]@{ type=$type; name=$name; action=$action; success=$false; state=''; source=''; message='' }

    function Invoke-AppCmd($kind, $itemName, $verb) {
      $appcmd = Join-Path $env:windir 'System32\\inetsrv\\appcmd.exe'
      if (-not (Test-Path $appcmd)) { throw 'appcmd.exe پیدا نشد؛ IIS نصب نیست یا دسترسی کافی وجود ندارد.' }
      if ($kind -eq 'site') {
        if ($verb -eq 'restart') {
          & $appcmd stop site /site.name:$itemName | Out-Null
          Start-Sleep -Seconds 1
          & $appcmd start site /site.name:$itemName | Out-Null
        } else {
          & $appcmd $verb site /site.name:$itemName | Out-Null
        }
        $line = (& $appcmd list site /name:$itemName) -join ' '
        if ($line -match 'state:([^\)]+)') { return $Matches[1] }
        return 'Unknown'
      }
      if ($kind -eq 'apppool') {
        if ($verb -eq 'restart' -or $verb -eq 'recycle') { & $appcmd recycle apppool /apppool.name:$itemName | Out-Null }
        else { & $appcmd $verb apppool /apppool.name:$itemName | Out-Null }
        $line = (& $appcmd list apppool /name:$itemName) -join ' '
        if ($line -match 'state:([^\)]+)') { return $Matches[1] }
        return 'Unknown'
      }
    }

    try {
      Import-Module WebAdministration -ErrorAction Stop
      $result.source = 'WebAdministration'
      if ($type -eq 'site') {
        if ($action -eq 'start') { Start-Website -Name $name }
        elseif ($action -eq 'stop') { Stop-Website -Name $name }
        elseif ($action -eq 'restart') { Stop-Website -Name $name -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Start-Website -Name $name }
        $result.state = (Get-Website -Name $name).State.ToString()
      } else {
        if ($action -eq 'start') { Start-WebAppPool -Name $name }
        elseif ($action -eq 'stop') { Stop-WebAppPool -Name $name }
        elseif ($action -eq 'restart' -or $action -eq 'recycle') { Restart-WebAppPool -Name $name }
        $result.state = (Get-WebAppPoolState -Name $name).Value.ToString()
      }
      $result.success = $true
    } catch {
      $result.source = 'appcmd'
      $result.state = Invoke-AppCmd $type $name $action
      $result.success = $true
      $result.message = 'Executed by appcmd fallback'
    }
    $result | ConvertTo-Json -Depth 5 -Compress
  `;

  try {
    const result = await executeOnServer(server, script);
    clearCache(`iis:${server.id}`);
    clearCache(`alerts:${server.id}`);
    clearCache('live:');
    res.json({ success: true, type: normalizedType, name, action: normalizedAction, result: result ? JSON.parse(result) : null });
  } catch (err) { throw err; }
}, 'iis action'));

module.exports = router;
