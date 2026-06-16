const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cacheStore = new Map();
const pendingRequests = new Map();

const isFresh = (entry, ttlMs) => entry && (Date.now() - entry.timestamp) < ttlMs;

export const fetchCached = async (key, loader, options = {}) => {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cachedEntry = cacheStore.get(key);

  if (!options.force && isFresh(cachedEntry, ttlMs)) {
    return cachedEntry.value;
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const request = loader()
    .then((value) => {
      cacheStore.set(key, {
        value,
        timestamp: Date.now()
      });
      pendingRequests.delete(key);
      return value;
    })
    .catch((error) => {
      pendingRequests.delete(key);
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

export const invalidateCache = (prefixes = []) => {
  const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];

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
};

export const clearCache = () => {
  cacheStore.clear();
  pendingRequests.clear();
};
