const startedAt = Date.now();
const requests = [];
const MAX_REQUESTS = 2000;

function recordRequest(entry) {
  requests.push({ ...entry, timestamp: Date.now() });
  if (requests.length > MAX_REQUESTS) requests.splice(0, requests.length - MAX_REQUESTS);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function getRuntimeSnapshot(windowMinutes = 15) {
  const cutoff = Date.now() - Math.max(1, Number(windowMinutes || 15)) * 60 * 1000;
  const recent = requests.filter((item) => item.timestamp >= cutoff);
  const durations = recent.map((item) => item.durationMs);
  const errors = recent.filter((item) => item.statusCode >= 500).length;
  const memory = process.memoryUsage();
  return {
    status: 'ok',
    service: 'serverpulse-monitor',
    version: require('../../package.json').version,
    node: process.version,
    environment: process.env.NODE_ENV || 'development',
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMB: Number((memory.rss / 1024 / 1024).toFixed(1)),
      heapUsedMB: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
      heapTotalMB: Number((memory.heapTotal / 1024 / 1024).toFixed(1))
    },
    requests: {
      windowMinutes: Math.max(1, Number(windowMinutes || 15)),
      total: recent.length,
      errors,
      errorRate: recent.length ? Number(((errors / recent.length) * 100).toFixed(2)) : 0,
      p50Ms: Number(percentile(durations, 0.5).toFixed(1)),
      p95Ms: Number(percentile(durations, 0.95).toFixed(1)),
      p99Ms: Number(percentile(durations, 0.99).toFixed(1))
    },
    timestamp: new Date().toISOString()
  };
}

function runtimeMetricsMiddleware(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    recordRequest({ method: req.method, path: req.route?.path || req.path, statusCode: res.statusCode, durationMs });
  });
  next();
}

module.exports = { getRuntimeSnapshot, runtimeMetricsMiddleware };
