function isSqlEnabled(server) {
  if (!server) return false;
  if (server.features && server.features.sql === false) return false;
  if (server.sql && server.sql.enabled === false) return false;
  if (server.hasSql === false) return false;

  // Backward compatibility: old servers that already have SQL settings are treated as SQL-enabled.
  return !!server.sql;
}

function isIisEnabled(server) {
  if (!server) return false;
  if (server.features && server.features.iis === false) return false;
  if (server.iis && server.iis.enabled === false) return false;
  if (server.hasIis === false) return false;

  // Backward compatibility: old servers without explicit feature flag are IIS-disabled by default.
  // In this environment only dedicated web servers usually have IIS.
  return server.features?.iis === true || server.iis?.enabled === true || server.hasIis === true;
}


function isCreditEnabled(server) {
  if (!server) return false;
  if (server.features && server.features.credit === false) return false;
  if (server.credit && server.credit.enabled === false) return false;
  if (server.hasCredit === false) return false;
  return server.features?.credit === true || server.credit?.enabled === true || server.hasCredit === true;
}

function normalizeServerForStorage(server) {
  const input = server || {};
  const sqlEnabled = input.features?.sql !== undefined
    ? input.features.sql !== false
    : (input.sql?.enabled !== false && input.hasSql !== false && !!input.sql);

  const iisEnabled = input.features?.iis !== undefined
    ? input.features.iis === true
    : (input.iis?.enabled === true || input.hasIis === true);

  const creditEnabled = input.features?.credit !== undefined
    ? input.features.credit === true
    : (input.credit?.enabled === true || input.hasCredit === true);

  const normalized = {
    ...input,
    features: {
      ...(input.features || {}),
      winrm: input.features?.winrm !== false,
      sql: sqlEnabled,
      iis: iisEnabled,
      credit: creditEnabled
    },
    paths: input.paths || { logs: [], backups: [] },
    monitoredServices: input.monitoredServices || []
  };

  normalized.winrm = {
    ...(input.winrm || {}),
    authType: input.winrm?.authType || (input.host === 'localhost' ? 'local' : 'credential'),
    computerName: input.winrm?.computerName || input.winrm?.hostName || ''
  };

  if (sqlEnabled) {
    normalized.sql = {
      ...(input.sql || {}),
      enabled: true,
      authType: input.sql?.authType || 'windows',
      server: input.sql?.server || input.host || '',
      port: Number(input.sql?.port || 1433),
      username: input.sql?.authType === 'sql' ? (input.sql?.username || '') : (input.sql?.username || ''),
      password: input.sql?.authType === 'sql' ? (input.sql?.password || '') : (input.sql?.password || '')
    };
  } else {
    normalized.sql = null;
  }

  normalized.iis = iisEnabled ? { ...(input.iis || {}), enabled: true } : null;
  normalized.credit = creditEnabled ? { ...(input.credit || {}), enabled: true } : null;

  delete normalized.hasSql;
  delete normalized.hasIis;
  delete normalized.hasCredit;
  return normalized;
}

function publicServerSummary(server) {
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    features: {
      winrm: server.features?.winrm !== false,
      sql: isSqlEnabled(server),
      iis: isIisEnabled(server),
      credit: isCreditEnabled(server)
    },
    winrm: { authType: server.winrm?.authType || 'local', computerName: server.winrm?.computerName || '' }
  };
}

function sqlDisabledResponse(server) {
  return {
    skipped: true,
    reason: 'SQL_DISABLED',
    message: 'برای این سرور SQL Server فعال نیست.'
  };
}

function iisDisabledResponse(server) {
  return {
    skipped: true,
    reason: 'IIS_DISABLED',
    iisInstalled: false,
    sites: [],
    appPools: [],
    message: 'برای این سرور IIS فعال نیست.'
  };
}

module.exports = {
  isSqlEnabled,
  isIisEnabled,
  isCreditEnabled,
  normalizeServerForStorage,
  publicServerSummary,
  sqlDisabledResponse,
  iisDisabledResponse
};
