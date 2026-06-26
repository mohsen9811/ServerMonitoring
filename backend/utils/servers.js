const { resolveEnvRefs } = require('./env');
const { resolveProjectPath, ensureJsonFile, readJsonFile, writeJsonFile } = require('./configStore');

const configPath = resolveProjectPath(process.env.SERVERS_FILE, 'backend/config/servers.json');

function ensureConfigFile() {
  ensureJsonFile(configPath, { servers: [] });
}

function getRawServers() {
  const parsed = readJsonFile(configPath, { servers: [] });
  return Array.isArray(parsed.servers) ? parsed.servers : [];
}

function getServers() {
  return resolveEnvRefs(getRawServers());
}

function saveServers(servers) {
  writeJsonFile(configPath, { servers: Array.isArray(servers) ? servers : [] });
}

function getServerById(id) {
  return getServers().find(server => server.id === id);
}

module.exports = { configPath, ensureConfigFile, getServers, getRawServers, saveServers, getServerById };
