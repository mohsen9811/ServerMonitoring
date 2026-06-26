const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { asyncRoute, sendError } = require('../utils/errors');
const { getServerById, getServers } = require('../utils/servers');
const { isSqlEnabled, sqlDisabledResponse } = require('../utils/features');
const { withSqlPool } = require('../utils/sqlClient');
const { resolveProjectPath, ensureJsonFile, readJsonFile, writeJsonFile } = require('../utils/configStore');

const configPath = resolveProjectPath(process.env.CREDIT_PROCS_FILE, 'backend/config/creditProcedures.json');

function defaultStore() {
  return { procedures: [] };
}

function ensureStore() {
  ensureJsonFile(configPath, defaultStore());
}

function readStore() {
  ensureStore();
  const data = readJsonFile(configPath, defaultStore());
  return { procedures: Array.isArray(data.procedures) ? data.procedures : [] };
}

function saveStore(store) {
  writeJsonFile(configPath, { procedures: Array.isArray(store.procedures) ? store.procedures : [] });
}

function normalizeProcedure(input = {}, existing = {}) {
  const name = String(input.name ?? existing.name ?? '').trim();
  const script = String(input.script ?? existing.script ?? '').trim();
  if (!name || !script) {
    const err = new Error('Procedure name and script are required');
    err.code = 'VALIDATION_ERROR';
    err.statusCode = 400;
    err.hint = 'نام تست و متن T-SQL الزامی است.';
    throw err;
  }
  const id = String(existing.id || input.id || crypto.randomUUID?.() || `proc-${Date.now()}`).trim();
  return {
    id,
    name,
    description: String(input.description ?? existing.description ?? '').trim(),
    serverId: String(input.serverId ?? existing.serverId ?? '').trim(),
    database: String(input.database ?? existing.database ?? 'master').trim() || 'master',
    timeoutSeconds: Math.max(5, Math.min(Number(input.timeoutSeconds ?? existing.timeoutSeconds ?? 60) || 60, 300)),
    parameters: Array.isArray(input.parameters ?? existing.parameters)
      ? (input.parameters ?? existing.parameters).map(p => ({
          name: String(p.name || '').trim(),
          label: String(p.label || p.name || '').trim(),
          type: String(p.type || 'string').trim().toLowerCase(),
          defaultValue: p.defaultValue ?? ''
        })).filter(p => p.name)
      : [],
    script
  };
}

function sqlLiteral(value, type = 'string') {
  if (value === null || value === undefined || String(value).toUpperCase() === 'NULL') return 'NULL';
  const raw = String(value);
  if (['number', 'int', 'decimal', 'float', 'bit'].includes(String(type).toLowerCase())) {
    if (!/^-?\d+(\.\d+)?$/.test(raw.trim())) {
      const err = new Error(`Invalid numeric value: ${raw}`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    return raw.trim();
  }
  return `N'${raw.replace(/'/g, "''")}'`;
}

function renderScript(proc, values = {}) {
  const parameterMap = new Map((proc.parameters || []).map(p => [p.name, p]));
  const merged = {};
  for (const p of proc.parameters || []) merged[p.name] = values[p.name] ?? p.defaultValue ?? '';
  for (const [key, value] of Object.entries(values || {})) merged[key] = value;

  return String(proc.script || '')
    .replace(/\{\{raw:([A-Za-z0-9_]+)\}\}/g, (_, key) => String(merged[key] ?? ''))
    .replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => {
      const p = parameterMap.get(key) || { type: 'string' };
      return sqlLiteral(merged[key], p.type);
    });
}

function publicProcedure(proc) {
  return {
    id: proc.id,
    name: proc.name,
    description: proc.description || '',
    serverId: proc.serverId || '',
    database: proc.database || 'master',
    timeoutSeconds: proc.timeoutSeconds || 60,
    parameters: proc.parameters || [],
    script: proc.script || ''
  };
}

router.get('/', asyncRoute(async (req, res) => {
  const procedures = readStore().procedures.map(publicProcedure);
  const servers = getServers().filter(isSqlEnabled).map(s => ({ id: s.id, name: s.name, host: s.host }));
  res.json({ procedures, servers });
}, 'list credit procedures'));

router.post('/', asyncRoute(async (req, res) => {
  const store = readStore();
  const proc = normalizeProcedure(req.body || {});
  if (store.procedures.some(x => x.id === proc.id)) {
    const err = new Error('Duplicate procedure id');
    err.code = 'DUPLICATE_PROCEDURE';
    err.statusCode = 400;
    throw err;
  }
  store.procedures.push(proc);
  saveStore(store);
  res.json({ success: true, procedure: publicProcedure(proc) });
}, 'create credit procedure'));

router.put('/:id', asyncRoute(async (req, res) => {
  const store = readStore();
  const index = store.procedures.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Procedure not found', code: 'PROCEDURE_NOT_FOUND' });
  store.procedures[index] = normalizeProcedure(req.body || {}, store.procedures[index]);
  saveStore(store);
  res.json({ success: true, procedure: publicProcedure(store.procedures[index]) });
}, 'update credit procedure'));

router.delete('/:id', asyncRoute(async (req, res) => {
  const store = readStore();
  const next = store.procedures.filter(p => p.id !== req.params.id);
  if (next.length === store.procedures.length) return res.status(404).json({ error: 'Procedure not found', code: 'PROCEDURE_NOT_FOUND' });
  saveStore({ procedures: next });
  res.json({ success: true });
}, 'delete credit procedure'));

router.post('/:id/test', async (req, res) => {
  const store = readStore();
  const proc = store.procedures.find(p => p.id === req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procedure not found', code: 'PROCEDURE_NOT_FOUND' });

  const serverId = String(req.body?.serverId || proc.serverId || '').trim();
  const database = String(req.body?.database || proc.database || 'master').trim() || 'master';
  const server = getServerById(serverId);
  if (!server) return res.status(404).json({ error: 'Server not found', code: 'SERVER_NOT_FOUND', hint: 'برای این تست یک SQL Server معتبر انتخاب کنید.' });
  if (!isSqlEnabled(server)) return res.status(400).json(sqlDisabledResponse(server));

  const started = Date.now();
  try {
    const script = renderScript(proc, req.body?.parameters || {});
    const result = await withSqlPool(server, database, async (pool) => {
      const request = pool.request();
      request.timeout = Math.max(5000, Math.min(Number(req.body?.timeoutSeconds || proc.timeoutSeconds || 60) * 1000, 300000));
      return await request.query(script);
    });
    res.json({
      success: true,
      procedureId: proc.id,
      procedureName: proc.name,
      serverId,
      database,
      durationMs: Date.now() - started,
      rowsAffected: result.rowsAffected || [],
      recordsets: result.recordsets || [],
      renderedScript: req.body?.includeScript === true ? renderScript(proc, req.body?.parameters || {}) : undefined
    });
  } catch (err) {
    sendError(res, err, err.statusCode || 500, 'credit procedure test');
  }
});

module.exports = router;
