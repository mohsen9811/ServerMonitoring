const sql = require('mssql');
const { isSqlEnabled } = require('./features');
const poolCache = new Map();

function configKey(server, database) {
  return `${server.id || server.host}:${database}`;
}

function buildSqlConfig(server, database = 'master') {
  if (!isSqlEnabled(server)) {
    const err = new Error('SQL is disabled for this server');
    err.code = 'SQL_DISABLED';
    err.statusCode = 400;
    throw err;
  }
  if (!server || !server.sql) throw new Error('SQL configuration is missing for this server');

  const config = {
    server: server.sql.server || server.host,
    port: Number(server.sql.port || 1433),
    database,
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true
    }
  };

  if (server.sql.authType === 'windows') {
    config.options.trustedConnection = true;
  } else {
    config.user = server.sql.username || '';
    config.password = server.sql.password || '';
  }

  return config;
}

async function getPool(server, database) {
  const key = configKey(server, database);
  if (poolCache.has(key)) {
    const existing = poolCache.get(key);
    if (existing.connected) return existing;
    poolCache.delete(key);
  }
  const pool = new sql.ConnectionPool(buildSqlConfig(server, database));
  await pool.connect();
  pool.on('error', err => {
    console.error(`SQL Pool error [${key}]:`, err.message);
    poolCache.delete(key);
  });
  poolCache.set(key, pool);
  return pool;
}

async function withSqlPool(server, database, callback) {
  const pool = await getPool(server, database);
  try {
    return await callback(pool, sql);
  } finally {
    // Connection pooling manages connections - no need to close per call
  }
}

module.exports = { sql, buildSqlConfig, withSqlPool };
