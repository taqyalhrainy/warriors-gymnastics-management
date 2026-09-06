const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cacheStore = new Map();
const pendingRequests = new Map();
const keyVersions = new Map();
let cacheVersion = 0;

const isFresh = (entry, ttlMs) => entry && (Date.now() - entry.timestamp) < ttlMs;
const getKeyVersion = (key) => keyVersions.get(key) || 0;

const bumpKeyVersion = (key) => {
  keyVersions.set(key, getKeyVersion(key) + 1);
};

export const fetchCached = async (key, loader, options = {}) => {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cachedEntry = cacheStore.get(key);

  if (!options.force && isFresh(cachedEntry, ttlMs)) {
    return cachedEntry.value;
  }

  if (!options.force && pendingRequests.has(key)) {
    return pendingRequests.get(key).promise;
  }

  const startedAtVersion = getKeyVersion(key);
  let request;
  request = loader()
    .then((value) => {
      const activeRequest = pendingRequests.get(key);
      if (activeRequest?.promise === request && startedAtVersion === getKeyVersion(key)) {
        cacheStore.set(key, {
          value,
          timestamp: Date.now()
        });
      }
      if (activeRequest?.promise === request) {
        pendingRequests.delete(key);
      }
      return value;
    })
    .catch((error) => {
      if (pendingRequests.get(key)?.promise === request) {
        pendingRequests.delete(key);
      }
      throw error;
    });

  pendingRequests.set(key, { promise: request, version: startedAtVersion });
  return request;
};

export const getCachedValue = (key, options = {}) => {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cachedEntry = cacheStore.get(key);
  return isFresh(cachedEntry, ttlMs) ? cachedEntry.value : undefined;
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
};

export const invalidateCache = (prefixes = []) => {
  const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
  const shouldBumpVersion = prefixList.some(Boolean);

  const matchingKeys = new Set([
    ...cacheStore.keys(),
    ...pendingRequests.keys(),
    ...keyVersions.keys()
  ]);
  matchingKeys.forEach((key) => {
    if (prefixList.some((prefix) => key.startsWith(prefix))) {
      bumpKeyVersion(key);
      cacheStore.delete(key);
      pendingRequests.delete(key);
    }
  });

  if (shouldBumpVersion) {
    cacheVersion += 1;
  }
};

export const clearCache = () => {
  new Set([
    ...cacheStore.keys(),
    ...pendingRequests.keys(),
    ...keyVersions.keys()
  ]).forEach(bumpKeyVersion);
  cacheStore.clear();
  pendingRequests.clear();
  cacheVersion += 1;
};

export const getCacheVersion = () => cacheVersion;
