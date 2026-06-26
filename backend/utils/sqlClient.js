const sql = require('mssql');
const { isSqlEnabled } = require('./features');

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
    requestTimeout: 30000,
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

async function withSqlPool(server, database, callback) {
  const pool = new sql.ConnectionPool(buildSqlConfig(server, database));
  await pool.connect();
  try {
    return await callback(pool, sql);
  } finally {
    await pool.close().catch(() => {});
  }
}

module.exports = { sql, buildSqlConfig, withSqlPool };
