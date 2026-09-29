const id = (value) => String(value?._id || value || '');
const day = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const authoritativeField = (incoming, fallback, key, defaultValue) => {
  if (incoming && Object.hasOwn(incoming, key) && incoming[key] !== undefined) return incoming[key];
  if (fallback && Object.hasOwn(fallback, key) && fallback[key] !== undefined) return fallback[key];
  return defaultValue;
};

export const isAttendanceInCycle = (record, player, cycleStart) => {
  if ((player?.currentSubscriptionExcludedAttendanceIds || []).some((value) => id(value) === id(record._id))) return false;
  if ((player?.currentSubscriptionAttendanceIds || []).some((value) => id(value) === id(record._id))) return true;
  return !cycleStart || day(record.date) >= day(cycleStart);
};

export const attendanceCycleStart = (player) => {
  const values = [
    player?.currentSubscriptionStartedAt,
    player?.startDate,
    player?.subscriptionId?.startDate
  ].filter(Boolean);
  return values.reduce((latest, value) => {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return latest;
    return !latest || timestamp > new Date(latest).getTime() ? value : latest;
  }, '');
};

export const packageCounter = (player) => {
  const total = Math.max(0, Number(player?.packageClasses || player?.subscriptionId?.totalSessions || 0));
  const count = Number(player?.attendancePresentCount ?? player?.subscriptionId?.usedSessions ?? 0);
  return { total, used: Math.max(0, total ? Math.min(total, count) : count) };
};

export const countAttendanceForCycle = (records, player, cycleStart = attendanceCycleStart(player)) => {
  if (!Array.isArray(records)) return packageCounter(player).used;
  const dates = new Set();
  records.forEach((record) => {
    if (record.playerId && id(record.playerId) !== id(player)) return;
    if (record.status !== 'present' || !isAttendanceInCycle(record, player, cycleStart)) return;
    const value = day(record.date);
    if (Number.isFinite(value)) dates.add(value);
  });
  const { total } = packageCounter(player);
  return total ? Math.min(total, dates.size) : dates.size;
};

// Historical group membership must not replace the current subscription used by counters.
export const mergeCurrentAttendanceState = (snapshot, current) => {
  const result = { ...snapshot };
  for (const key of ['startDate', 'endDate', 'currentSubscriptionStartedAt',
    'currentSubscriptionAttendanceIds', 'currentSubscriptionExcludedAttendanceIds',
    'packageClasses', 'packageHours', 'packageName', 'subscriptionId',
    'attendancePresentCount', 'status', 'subscriptionNeedsAttention']) {
    if (Object.hasOwn(current, key)) result[key] = current[key];
  }
  return result;
};

export const isAttendanceSubscriptionExpired = (player, now = new Date()) => {
  if (!player || player.status === 'frozen') return false;
  if (player.subscriptionNeedsAttention || player.status === 'expired') return true;
  const end = player.endDate || player.subscriptionId?.endDate;
  if (end && day(end) <= day(now)) return true;
  const { total, used } = packageCounter(player);
  return total > 0 && used >= total;
};

// A recorded class belongs to its original group, even after a membership change.
export const attachAttendanceRecords = (groups, records) => {
  const playersById = new Map(groups.flatMap((group) => group.players.map((player) => [id(player), player])));
  const recordsByGroup = new Map();
  records.forEach((record) => {
    const groupId = id(record.groupId);
    if (!recordsByGroup.has(groupId)) recordsByGroup.set(groupId, new Map());
    recordsByGroup.get(groupId).set(id(record.playerId), record);
  });
  return groups.map((group) => {
    const marks = recordsByGroup.get(id(group)) || new Map();
    const members = new Map(group.players.map((player) => [id(player), player]));
    marks.forEach((record, playerId) => {
      if (!members.has(playerId) && playersById.has(playerId)) members.set(playerId, playersById.get(playerId));
    });
    const players = [...members.values()].map((player) => ({
      ...player,
      attendanceGroupId: id(group),
      todayAttendance: marks.get(id(player)) || null
    }));
    return { ...group, players, currentCount: players.length,
      markedCount: players.filter((player) => player.todayAttendance).length,
      presentCount: players.filter((player) => player.todayAttendance?.status === 'present').length };
  });
};

export const getUnassignedAttendance = (records, assignedRecords) => {
  const assigned = new Set(assignedRecords.map((record) => id(record)));
  return records.filter((record) => !assigned.has(id(record)));
};
