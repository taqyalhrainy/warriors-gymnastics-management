const id = (value) => String(value?._id || value || '');
const day = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const isAttendanceInCycle = (record, player, cycleStart) => {
  if ((player?.currentSubscriptionExcludedAttendanceIds || []).some((value) => id(value) === id(record._id))) return false;
  if ((player?.currentSubscriptionAttendanceIds || []).some((value) => id(value) === id(record._id))) return true;
  return !cycleStart || day(record.date) >= day(cycleStart);
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
