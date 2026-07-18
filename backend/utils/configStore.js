const fs = require('fs');
const path = require('path');

function projectRoot() {
  return path.join(__dirname, '../..');
}

function resolveProjectPath(value, fallback) {
  const raw = String(value || fallback || '').trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.join(projectRoot(), raw);
}

function ensureJsonFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
    return;
  }
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
  }
}

function readJsonFile(filePath, defaultValue) {
  ensureJsonFile(filePath, defaultValue);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify(value, null, 2);
  JSON.parse(payload);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, payload, 'utf8');
  try {
    fs.copyFileSync(tempPath, filePath);
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

module.exports = { projectRoot, resolveProjectPath, ensureJsonFile, readJsonFile, writeJsonFile };
