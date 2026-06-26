const fs = require('fs');
const path = require('path');

const preferencesPath = path.join(__dirname, '../config/alert-preferences.json');

function ensureAlertPreferencesFile() {
  if (!fs.existsSync(preferencesPath)) {
    fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
    fs.writeFileSync(preferencesPath, JSON.stringify({ muted: {} }, null, 2), 'utf8');
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(preferencesPath, 'utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || !parsed.muted || typeof parsed.muted !== 'object') {
      fs.writeFileSync(preferencesPath, JSON.stringify({ muted: {} }, null, 2), 'utf8');
    }
  } catch {
    fs.writeFileSync(preferencesPath, JSON.stringify({ muted: {} }, null, 2), 'utf8');
  }
}

function getAlertSignature(alert = {}) {
  const serverId = String(alert.serverId || '').trim().toLowerCase();
  const category = String(alert.category || 'general').trim().toLowerCase();
  const key = String(alert.key || alert.title || '').trim().toLowerCase();
  return [serverId, category, key].map(part => part.replace(/\s+/g, ' ')).join('::');
}

function readAlertPreferences() {
  ensureAlertPreferencesFile();
  const parsed = JSON.parse(fs.readFileSync(preferencesPath, 'utf8') || '{}');
  return { muted: parsed.muted && typeof parsed.muted === 'object' ? parsed.muted : {} };
}

function saveAlertPreferences(preferences) {
  ensureAlertPreferencesFile();
  fs.writeFileSync(preferencesPath, JSON.stringify({ muted: preferences.muted || {} }, null, 2), 'utf8');
}

function enrichAlert(alert) {
  const signature = getAlertSignature(alert);
  return { ...alert, signature };
}

function filterMutedAlerts(alerts = []) {
  const preferences = readAlertPreferences();
  return alerts.map(enrichAlert).filter(alert => !preferences.muted[alert.signature]);
}

function muteAlert(alert, mutedBy = 'ui') {
  const preferences = readAlertPreferences();
  const normalized = enrichAlert(alert || {});
  preferences.muted[normalized.signature] = {
    signature: normalized.signature,
    serverId: normalized.serverId || '',
    serverName: normalized.serverName || '',
    category: normalized.category || 'general',
    key: normalized.key || normalized.title || '',
    title: normalized.title || '',
    message: normalized.message || '',
    mutedAt: new Date().toISOString(),
    mutedBy
  };
  saveAlertPreferences(preferences);
  return preferences.muted[normalized.signature];
}

function unmuteAlert(signature) {
  const preferences = readAlertPreferences();
  if (preferences.muted[signature]) {
    delete preferences.muted[signature];
    saveAlertPreferences(preferences);
    return true;
  }
  return false;
}

function listMutedAlerts() {
  const preferences = readAlertPreferences();
  return Object.values(preferences.muted || {}).sort((a, b) => String(b.mutedAt || '').localeCompare(String(a.mutedAt || '')));
}

module.exports = {
  preferencesPath,
  ensureAlertPreferencesFile,
  getAlertSignature,
  enrichAlert,
  filterMutedAlerts,
  muteAlert,
  unmuteAlert,
  listMutedAlerts
};
