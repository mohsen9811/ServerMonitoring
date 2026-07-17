const DEFAULT_LIMIT = Math.max(120, Number(process.env.METRICS_HISTORY_LIMIT || 1440));
const histories = new Map();

function normalizeSample(sample = {}, timestamp = new Date().toISOString()) {
  return {
    timestamp,
    cpu: Number(sample.cpuPercent || 0),
    ram: Number(sample.ramPercent || 0),
    diskBusy: Number(sample.diskBusyPercent || 0),
    networkRxMbps: Number(sample.networkRxMbps || 0),
    networkTxMbps: Number(sample.networkTxMbps || 0),
    processQueue: Number(sample.processorQueueLength || 0)
  };
}

function recordMetric(serverId, sample, timestamp) {
  if (!serverId || !sample) return;
  const key = String(serverId);
  const list = histories.get(key) || [];
  const normalized = normalizeSample(sample, timestamp);
  if (list.at(-1)?.timestamp === normalized.timestamp) return;
  list.push(normalized);
  if (list.length > DEFAULT_LIMIT) list.splice(0, list.length - DEFAULT_LIMIT);
  histories.set(key, list);
}

function getMetricHistory(serverId, options = {}) {
  const minutes = Math.max(1, Math.min(Number(options.minutes || 60), 24 * 60));
  const maxPoints = Math.max(30, Math.min(Number(options.maxPoints || 240), 720));
  const cutoff = Date.now() - minutes * 60 * 1000;
  const filtered = (histories.get(String(serverId)) || []).filter(
    (sample) => Date.parse(sample.timestamp) >= cutoff
  );
  if (filtered.length <= maxPoints) return filtered;

  const bucketSize = Math.ceil(filtered.length / maxPoints);
  const output = [];
  for (let i = 0; i < filtered.length; i += bucketSize) {
    const bucket = filtered.slice(i, i + bucketSize);
    const avg = (key) => bucket.reduce((sum, item) => sum + Number(item[key] || 0), 0) / bucket.length;
    output.push({
      timestamp: bucket.at(-1).timestamp,
      cpu: Number(avg('cpu').toFixed(1)),
      ram: Number(avg('ram').toFixed(1)),
      diskBusy: Number(avg('diskBusy').toFixed(1)),
      networkRxMbps: Number(avg('networkRxMbps').toFixed(2)),
      networkTxMbps: Number(avg('networkTxMbps').toFixed(2)),
      processQueue: Number(avg('processQueue').toFixed(1))
    });
  }
  return output;
}

function clearMetricHistory(serverId) {
  if (serverId) histories.delete(String(serverId));
  else histories.clear();
}

module.exports = { recordMetric, getMetricHistory, clearMetricHistory };
