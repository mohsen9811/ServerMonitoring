const fs = require('fs');
const path = require('path');

let loaded = false;

function parseEnvLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  return { key, value };
}

function loadEnvFile(filePath = path.join(__dirname, '../../.env')) {
  if (loaded) return;
  loaded = true;
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed || !parsed.key) continue;
    if (process.env[parsed.key] === undefined) process.env[parsed.key] = parsed.value;
  }
}

function resolveEnvRefs(value) {
  if (typeof value === 'string') {
    const exact = value.match(/^\$\{([A-Z0-9_]+)\}$/i);
    if (exact) return process.env[exact[1]] ?? '';
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, key) => process.env[key] ?? '');
  }
  if (Array.isArray(value)) return value.map(resolveEnvRefs);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) out[key] = resolveEnvRefs(val);
    return out;
  }
  return value;
}

loadEnvFile();

module.exports = { loadEnvFile, resolveEnvRefs };
