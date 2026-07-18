const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'serverpulse-api-test-'));
const port = 31987 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}/api`;
const child = spawn(process.execPath, ['backend/server.js'], {
  cwd: projectRoot,
  env: { ...process.env, PORT: String(port), SERVERS_FILE: path.join(tempRoot, 'servers.json'), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

let serverOutput = '';
child.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
child.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

async function request(url, options) {
  const response = await fetch(`${baseUrl}${url}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${response.status} ${url}: ${data?.error || text}`);
  return data;
}

async function waitForApi() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await request('/health'); return; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  throw new Error(`API did not become ready. ${serverOutput}`);
}

async function run() {
  await waitForApi();
  const created = await request('/servers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'test-local', name: 'Test Local', host: 'localhost',
      features: { winrm: true, sql: false, iis: false, credit: false },
      winrm: { authType: 'local' }
    })
  });
  if (!created?.success) throw new Error('Create server did not return success');

  const servers = await request('/servers');
  if (servers.length !== 1 || servers[0].id !== 'test-local') throw new Error('Created server was not persisted');

  const disks = await request('/disk/test-local?force=1');
  if (!Array.isArray(disks) || !disks.length) throw new Error('Disk collector returned no local drives');
  for (const disk of disks) {
    const total = Number(disk.TotalGB);
    const used = Number(disk.UsedGB);
    const free = Number(disk.FreeGB);
    if (![total, used, free, Number(disk.UsedPercent)].every(Number.isFinite)) throw new Error('Disk collector returned non-numeric capacity');
    if (Math.abs(total - used - free) > 0.05) throw new Error(`Disk capacity mismatch for ${disk.Drive}`);
  }

  const allServices = await request('/services/all/test-local?force=1');
  if (!Array.isArray(allServices) || !allServices.length) throw new Error('Service discovery returned no services');
  const selected = allServices[0];
  await request('/services/test-local/monitor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serviceName: selected.Name, selectedFromList: true })
  });
  const monitored = await request('/services/test-local?force=1');
  if (!Array.isArray(monitored) || monitored[0]?.Name !== selected.Name) throw new Error('Monitored service was not added/read correctly');

  console.log(JSON.stringify({
    ok: true,
    serverCreate: true,
    diskCount: disks.length,
    diskSample: { drive: disks[0].Drive, totalGB: disks[0].TotalGB, usedGB: disks[0].UsedGB, freeGB: disks[0].FreeGB, usedPercent: disks[0].UsedPercent },
    discoveredServices: allServices.length,
    monitoredService: { name: monitored[0].Name, status: monitored[0].Status, startType: monitored[0].StartType }
  }, null, 2));
}

run().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}).finally(() => {
  child.kill();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
