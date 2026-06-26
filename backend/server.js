const express = require('express');
const cors = require('cors');
const path = require('path');
const { executeOnServer } = require('./utils/executor');
const { getServers, saveServers, getServerById, ensureConfigFile } = require('./utils/servers');
const { sendError, normalizeError } = require('./utils/errors');
const { withSqlPool } = require('./utils/sqlClient');
const { normalizeServerForStorage, publicServerSummary, isSqlEnabled } = require('./utils/features');

const app = express();
const PORT = process.env.PORT || 3000;

ensureConfigFile();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// API: get all servers
app.get('/api/servers', (req, res) => {
  const servers = getServers().map(publicServerSummary);
  res.json(servers);
});

app.get('/api/servers/:id', (req, res) => {
  const server = getServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'شناسه سرور در تنظیمات وجود ندارد.' });
  res.json(server);
});

app.post('/api/servers', (req, res) => {
  const newServer = req.body || {};
  if (!newServer.id || !newServer.name || !newServer.host) {
    return res.status(400).json({ error: 'Missing id, name or host', code: 'VALIDATION_ERROR', hint: 'شناسه، نام و Host را کامل وارد کنید.' });
  }
  if (!/^[a-zA-Z0-9\-_]+$/.test(newServer.id)) {
    return res.status(400).json({ error: 'Invalid server id', code: 'VALIDATION_ERROR', hint: 'شناسه فقط حروف انگلیسی، عدد، خط تیره و زیرخط قبول می‌کند.' });
  }

  const servers = getServers();
  if (servers.find(s => s.id === newServer.id)) {
    return res.status(400).json({ error: 'Duplicate server id', code: 'DUPLICATE_SERVER', hint: 'برای این سرور یک شناسه دیگر انتخاب کنید.' });
  }

  const storedServer = normalizeServerForStorage(newServer);
  servers.push(storedServer);
  saveServers(servers);
  res.json({ success: true, server: publicServerSummary(storedServer) });
});

app.put('/api/servers/:id', (req, res) => {
  const id = req.params.id;
  const updated = req.body || {};
  const servers = getServers();
  const index = servers.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'شناسه سرور در تنظیمات وجود ندارد.' });
  servers[index] = normalizeServerForStorage({ ...servers[index], ...updated });
  saveServers(servers);
  res.json({ success: true, server: publicServerSummary(servers[index]) });
});


// API: reorder servers in sidebar / user preferred order
app.post('/api/servers/reorder', (req, res) => {
  const order = Array.isArray(req.body?.order) ? req.body.order.map(String) : [];
  if (!order.length) return res.status(400).json({ error: 'Order is required', code: 'VALIDATION_ERROR', hint: 'لیست شناسه سرورها را ارسال کنید.' });
  const servers = getServers();
  const byId = new Map(servers.map(s => [String(s.id), s]));
  const ordered = [];
  for (const id of order) {
    if (byId.has(id)) {
      ordered.push(byId.get(id));
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());
  saveServers(ordered);
  res.json({ success: true, servers: ordered.map(publicServerSummary) });
});

app.delete('/api/servers/:id', (req, res) => {
  const servers = getServers();
  const newServers = servers.filter(s => s.id !== req.params.id);
  if (newServers.length === servers.length) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'شناسه سرور در تنظیمات وجود ندارد.' });
  saveServers(newServers);
  res.json({ success: true });
});

// API: add allowed path to server (normalized)
app.post('/api/servers/:id/allowed-paths', (req, res) => {
  let { path: newPath, type = 'logs' } = req.body || {};
  if (!newPath) return res.status(400).json({ error: 'Path required', code: 'VALIDATION_ERROR', hint: 'مسیر پوشه را وارد کنید.' });

  newPath = String(newPath).trim().replace(/\\+$/, '');

  const servers = getServers();
  const index = servers.findIndex(s => s.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'شناسه سرور در تنظیمات وجود ندارد.' });

  const server = servers[index];
  if (!server.paths) server.paths = { logs: [], backups: [] };
  if (!server.paths[type]) server.paths[type] = [];

  const exists = server.paths[type].some(p => p.toLowerCase() === newPath.toLowerCase());
  if (exists) return res.json({ success: false, error: 'Path already exists', code: 'DUPLICATE_PATH', path: newPath });

  server.paths[type].push(newPath);
  servers[index] = server;
  saveServers(servers);
  res.json({ success: true, path: newPath });
});

// تست اتصال موقت (بدون ذخیره)
app.post('/api/servers/test-connection-temp', async (req, res) => {
  const server = req.body || {};
  if (!server || !server.host) {
    return res.status(400).json({ error: 'Invalid server data', code: 'VALIDATION_ERROR', hint: 'Host/IP سرور را وارد کنید.' });
  }

  const results = { winrm: false, sql: false, error: null, details: null, hint: null };

  try {
    await executeOnServer(server, `"WinRM OK"`);
    results.winrm = true;
  } catch (err) {
    const normalized = normalizeError(err, 'temporary WinRM connection test');
    results.error = normalized.error;
    results.hint = normalized.hint;
    results.code = normalized.code;
    if (normalized.code === 'WINRM_TRUSTED_HOSTS') results.details = 'trustedhosts';
    else if (normalized.code === 'ACCESS_DENIED') results.details = 'access_denied';
    return res.json(results);
  }

  if (!isSqlEnabled(server)) {
    results.sql = null;
    results.sqlSkipped = true;
    return res.json(results);
  }

  try {
    await withSqlPool(server, 'master', async (pool) => {
      await pool.request().query('SELECT 1 AS ok');
    });
    results.sql = true;
  } catch (err) {
    const normalized = normalizeError(err, 'temporary SQL connection test');
    results.error = normalized.error;
    results.hint = normalized.hint;
    results.code = normalized.code;
  }

  res.json(results);
});

// Routes
app.use('/api/services', require('./routes/services'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/databases', require('./routes/databases'));
app.use('/api/disk', require('./routes/disk'));
app.use('/api/files', require('./routes/files'));
app.use('/api/connectivity', require('./routes/connectivity'));
app.use('/api/system', require('./routes/system'));
app.use('/api/iis', require('./routes/iis'));
app.use('/api/live', require('./routes/live'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/credit', require('./routes/credit'));

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found', code: 'NOT_FOUND', hint: 'آدرس API اشتباه است یا هنوز پیاده‌سازی نشده.' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  sendError(res, err, err.statusCode || 500, 'global error handler');
});

app.listen(PORT, () => {
  console.log(`✅ Monitor ready at http://localhost:${PORT}`);
});
