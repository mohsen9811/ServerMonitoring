const cache = new Map();
const pending = new Map();

function now() { return Date.now(); }

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  return item;
}

function setCache(key, data, meta = {}) {
  const item = { key, data, updatedAt: new Date().toISOString(), updatedAtMs: now(), ...meta };
  cache.set(key, item);
  return item;
}

function clearCache(prefix = '') {
  for (const key of cache.keys()) {
    if (!prefix || key.startsWith(prefix)) cache.delete(key);
  }
}

async function getCachedOrFresh(key, ttlMs, loader, options = {}) {
  const item = getCache(key);
  const maxAge = Number(ttlMs || 0);
  if (!options.force && item && maxAge > 0 && (now() - item.updatedAtMs) < maxAge) {
    return { ...item, stale: false, fromCache: true };
  }

  if (!options.force && pending.has(key)) {
    return pending.get(key);
  }

  const task = (async () => {
    try {
      const data = await loader();
      return { ...setCache(key, data), stale: false, fromCache: false };
    } catch (err) {
      if (item) return { ...item, stale: true, fromCache: true, error: err.message };
      throw err;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, task);
  return task;
}

module.exports = { getCache, setCache, clearCache, getCachedOrFresh };
