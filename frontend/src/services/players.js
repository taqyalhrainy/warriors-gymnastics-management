import api from './api.js';
import { fetchCached, invalidateCache, setCached, touchCacheVersion, updateCached } from './cache.js';

export const fetchPlayers = async (params) => {
  if (params && Object.keys(params).length) {
    const paramKeys = Object.keys(params);
    const cacheHintOnly = paramKeys.every((key) => ['dashboard', 'sidebar'].includes(key));
    if (cacheHintOnly) {
      return fetchCached('players:list', async () => {
        const response = await api.get('/players');
        return response.data;
      });
    }

    const response = await api.get('/players', { params });
    return response.data;
  }

  return fetchCached('players:list', async () => {
    const response = await api.get('/players');
    return response.data;
  });
};

const invalidatePlayerRelatedCache = (playerId) => {
  invalidateCache([
    'players:',
    'groups:',
    'payments:',
    'attendance:',
    'reports:'
  ]);
  if (playerId) {
    invalidateCache([`players:item:${playerId}`]);
  }
};

const getPlayerGroupIds = (player) => {
  if (Array.isArray(player?.groupIds) && player.groupIds.length) {
    return player.groupIds
      .map((group) => group?._id || group)
      .filter(Boolean)
      .map(String);
  }

  const groupId = player?.groupId?._id || player?.groupId;
  return groupId ? [String(groupId)] : [];
};

const upsertPlayer = (players, player) => {
  if (!Array.isArray(players)) {
    return players;
  }

  return [player, ...players.filter((item) => String(item._id) !== String(player._id))];
};

const patchCreatedPlayerIntoCache = (player) => {
  if (!player?._id) {
    return;
  }

  const groupIds = getPlayerGroupIds(player);
  setCached(`players:item:${player._id}`, player);
  updateCached('players:list', (players) => upsertPlayer(players, player));
  updateCached('groups:list', (groups) => {
    if (!Array.isArray(groups)) {
      return groups;
    }

    return groups.map((group) => (
      groupIds.includes(String(group._id))
        ? { ...group, currentCount: Number(group.currentCount || 0) + 1 }
        : group
    ));
  });

  groupIds.forEach((groupId) => {
    updateCached(`groups:players:${groupId}`, (players) => upsertPlayer(players, player));
  });

  invalidateCache(['reports:']);
  touchCacheVersion();
};

export const createPlayer = async (data) => {
  invalidatePlayerRelatedCache();
  const response = await api.post('/players', data);
  patchCreatedPlayerIntoCache(response.data);
  window.dispatchEvent(new CustomEvent('players:changed', {
    detail: {
      action: 'created',
      player: response.data
    }
  }));
  return response.data;
};

export const updatePlayer = async (id, data) => {
  invalidatePlayerRelatedCache(id);
  const response = await api.put(`/players/${id}`, data);
  invalidateCache([
    'players:list',
    'groups:',
    'payments:',
    'attendance:',
    'reports:'
  ]);
  setCached(`players:item:${id}`, response.data);
  window.dispatchEvent(new Event('players:changed'));
  return response.data;
};

export const deletePlayer = async (id) => {
  invalidatePlayerRelatedCache(id);
  const response = await api.delete(`/players/${id}`);
  invalidatePlayerRelatedCache(id);
  window.dispatchEvent(new Event('players:changed'));
  return response.data;
};

export const getPlayer = async (id, options = {}) => {
  return fetchCached(`players:item:${id}`, async () => {
    const response = await api.get(`/players/${id}`);
    return response.data;
  }, options);
};
