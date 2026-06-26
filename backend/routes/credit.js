const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { asyncRoute } = require('../utils/errors');
const { getServers, getServerById } = require('../utils/servers');
const { withSqlPool, sql } = require('../utils/sqlClient');
const { isSqlEnabled, isCreditEnabled } = require('../utils/features');

const configPath = path.join(__dirname, '../config/creditChecks.json');
let history = [];

function ensureConfig() {
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify([], null, 2), 'utf8');
  }
}
function readChecks() {
  ensureConfig();
  try { const arr = JSON.parse(fs.readFileSync(configPath, 'utf8') || '[]'); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}
function writeChecks(checks) {
  ensureConfig();
  fs.writeFileSync(configPath, JSON.stringify(checks, null, 2), 'utf8');
}
function makeId(title) {
  const base = String(title || 'credit-check').trim().replace(/\s+/g, '-').replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
  return `${base || 'credit-check'}-${Date.now()}`;
}
function getCreditServers() {
  return getServers().filter(s => isSqlEnabled(s) && isCreditEnabled(s));
}
function parseParams(params) {
  return Array.isArray(params) ? params.map(p => ({
    name: String(p.name || '').trim().replace(/^@/, ''),
    label: String(p.label || p.name || '').trim(),
    type: String(p.type || 'nvarchar').toLowerCase(),
    required: p.required === true || p.required === 'true',
    default: p.default ?? ''
  })).filter(p => p.name) : [];
}
function sqlType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('int')) return sql.Int;
  if (t.includes('bigint')) return sql.BigInt;
  if (t.includes('decimal') || t.includes('money') || t.includes('numeric')) return sql.Decimal(18, 4);
  if (t.includes('date')) return sql.NVarChar(40);
  if (t.includes('bit') || t.includes('bool')) return sql.Bit;
  return sql.NVarChar(sql.MAX);
}
function normalizeProcedureName(value) {
  const proc = String(value || '').trim();
  if (!proc) throw new Error('Stored Procedure name is required');
  if (!/^[a-zA-Z0-9_\.\[\]]+$/.test(proc)) throw new Error('Stored Procedure name contains invalid characters');
  return proc;
}

router.get('/checks', asyncRoute(async (req, res) => {
  res.json({ checks: readChecks(), targets: getCreditServers().map(s => ({ id: s.id, name: s.name, host: s.host, database: s.sql?.database || 'master' })) });
}, 'credit checks'));

router.post('/checks', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const checks = readChecks();
  const id = body.id || makeId(body.title);
  const item = {
    id,
    title: body.title || 'عملیات جدید',
    description: body.description || '',
    serverId: body.serverId || '',
    database: body.database || 'master',
    procedure: body.procedure || 'sys.sp_executesql',
    testMode: body.testMode !== false,
    enabled: body.enabled !== false,
    parameters: parseParams(body.parameters)
  };
  const idx = checks.findIndex(c => c.id === id);
  if (idx >= 0) checks[idx] = item; else checks.push(item);
  writeChecks(checks);
  res.json({ success: true, check: item });
}, 'save credit check'));

router.get('/history', (req, res) => res.json(history.slice(0, 30)));

router.post('/run/:id', asyncRoute(async (req, res) => {
  const start = Date.now();
  try {
    const checks = readChecks();
    const check = checks.find(c => c.id === req.params.id);
    if (!check) return res.status(404).json({ error: 'Credit check not found' });
    if (check.enabled === false) return res.status(400).json({ error: 'این عملیات غیرفعال است.' });
    const targets = getCreditServers();
    const server = check.serverId ? getServerById(check.serverId) : targets[0];
    if (!server || !isSqlEnabled(server) || !isCreditEnabled(server)) return res.status(400).json({ error: 'هیچ سرور SQL دارای سامانه اعتباری برای اجرای این عملیات تنظیم نشده است.' });
    const database = check.database || server.sql?.database || 'master';
    const inputValues = req.body?.params || {};
    let rows = [];

    if (check.testMode !== false) {
      rows = [{
        CheckTitle: check.title,
        SqlServerName: server.name,
        DatabaseName: database,
        SqlServerTime: new Date().toISOString(),
        Mode: 'TEST',
        Message: 'اجرای تستی موفق؛ برای اجرای واقعی Test Mode را خاموش و نام SP واقعی را وارد کنید.'
      }];
    } else {
      const proc = normalizeProcedureName(check.procedure);
      rows = await withSqlPool(server, database, async (pool) => {
        const request = pool.request();
        for (const p of parseParams(check.parameters)) {
          const value = inputValues[p.name] ?? p.default ?? null;
          if (p.required && (value === null || value === undefined || value === '')) throw new Error(`پارامتر ${p.label || p.name} الزامی است.`);
          request.input(p.name, sqlType(p.type), value === '' ? null : value);
        }
        const result = await request.execute(proc);
        return result.recordset || [];
      });
    }

    const record = { id: Date.now(), checkId: check.id, title: check.title, status: 'success', server: server.name, database, procedure: check.procedure, durationMs: Date.now() - start, time: new Date().toISOString() };
    history.unshift(record); history = history.slice(0, 30);
    res.json({ success: true, check, target: { id: server.id, name: server.name, database }, rows, durationMs: record.durationMs, time: record.time, history });
  } catch (err) {
    const record = { id: Date.now(), checkId: req.params.id, title: req.params.id, status: 'failed', error: err.message, durationMs: Date.now() - start, time: new Date().toISOString() };
    history.unshift(record); history = history.slice(0, 30);
    throw err;
  }
}, 'run credit check'));

module.exports = router;
