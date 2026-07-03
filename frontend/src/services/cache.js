const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cacheStore = new Map();
const pendingRequests = new Map();
let cacheVersion = 0;
let requestVersion = 0;

const isFresh = (entry, ttlMs) => entry && (Date.now() - entry.timestamp) < ttlMs;

export const fetchCached = async (key, loader, options = {}) => {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cachedEntry = cacheStore.get(key);

  if (!options.force && isFresh(cachedEntry, ttlMs)) {
    return cachedEntry.value;
  }

  if (!options.force && pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const startedAtVersion = requestVersion;
  let request;
  request = loader()
    .then((value) => {
      if (pendingRequests.get(key) === request && startedAtVersion === requestVersion) {
        cacheStore.set(key, {
          value,
          timestamp: Date.now()
        });
      }
      if (pendingRequests.get(key) === request) {
        pendingRequests.delete(key);
      }
      return value;
    })
    .catch((error) => {
      if (pendingRequests.get(key) === request) {
        pendingRequests.delete(key);
      }
      throw error;
    });

  pendingRequests.set(key, request);
  return request;
};

export const setCached = (key, value) => {
  cacheStore.set(key, {
    value,
    timestamp: Date.now()
  });
};

export const updateCached = (key, updater) => {
  const cachedEntry = cacheStore.get(key);
  if (!cachedEntry) {
    return undefined;
  }

  const nextValue = updater(cachedEntry.value);
  cacheStore.set(key, {
    value: nextValue,
    timestamp: Date.now()
  });
  return nextValue;
};

export const touchCacheVersion = () => {
  cacheVersion += 1;
  requestVersion += 1;
};

export const invalidateCache = (prefixes = []) => {
  const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
  const shouldBumpVersion = prefixList.some(Boolean);

  [...cacheStore.keys()].forEach((key) => {
    if (prefixList.some((prefix) => key.startsWith(prefix))) {
      cacheStore.delete(key);
    }
  });

  [...pendingRequests.keys()].forEach((key) => {
    if (prefixList.some((prefix) => key.startsWith(prefix))) {
      pendingRequests.delete(key);
    }
  });

  if (shouldBumpVersion) {
    cacheVersion += 1;
    requestVersion += 1;
  }
};

export const clearCache = () => {
  cacheStore.clear();
  pendingRequests.clear();
  cacheVersion += 1;
  requestVersion += 1;
};

export const getCacheVersion = () => cacheVersion;
