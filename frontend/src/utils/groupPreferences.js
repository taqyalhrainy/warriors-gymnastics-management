const GROUP_PREFERENCES_KEY = 'warriors-group-preferences';

const fallbackColors = ['#2563eb', '#f2c94c', '#16a34a', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899'];
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

const readPreferences = () => {
  if (typeof window === 'undefined') {
    return { colors: {}, order: [] };
  }

  try {
    const raw = window.localStorage.getItem(GROUP_PREFERENCES_KEY);
    if (!raw) return { colors: {}, order: [] };

    const parsed = JSON.parse(raw);
    return {
      colors: parsed?.colors && typeof parsed.colors === 'object' ? parsed.colors : {},
      order: Array.isArray(parsed?.order) ? parsed.order : []
    };
  } catch (error) {
    return { colors: {}, order: [] };
  }
};

const writePreferences = (preferences) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GROUP_PREFERENCES_KEY, JSON.stringify(preferences));
};

const getFallbackColor = (index) => fallbackColors[index % fallbackColors.length];

export const getGroupColor = (groupId, fallbackColor) => {
  const { colors } = readPreferences();
  const preferredColor = colors[groupId];

  if (hexColorPattern.test(preferredColor || '')) {
    return preferredColor.toLowerCase();
  }

  return fallbackColor;
};

export const saveGroupColor = (groupId, color) => {
  if (!groupId || !hexColorPattern.test(color || '')) return;

  const preferences = readPreferences();
  preferences.colors[groupId] = color.toLowerCase();
  writePreferences(preferences);
};

export const saveGroupOrder = (groupIds) => {
  const preferences = readPreferences();
  preferences.order = groupIds.filter(Boolean);
  writePreferences(preferences);
};

export const applyGroupPreferences = (groups) => {
  const preferences = readPreferences();
  const orderMap = new Map(preferences.order.map((groupId, index) => [groupId, index]));
  const sortedGroups = [...groups].sort((left, right) => {
    const leftOrder = orderMap.has(left._id) ? orderMap.get(left._id) : Number.MAX_SAFE_INTEGER;
    const rightOrder = orderMap.has(right._id) ? orderMap.get(right._id) : Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return groups.findIndex((group) => group._id === left._id) - groups.findIndex((group) => group._id === right._id);
  });

  return sortedGroups.map((group, index) => ({
    ...group,
    color: getGroupColor(group._id, getFallbackColor(index))
  }));
};
