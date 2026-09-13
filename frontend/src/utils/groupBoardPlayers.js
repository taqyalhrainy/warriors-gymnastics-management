const entityId = (value) => String(value?._id || value || '');

export const groupBoardPlayers = ({ groups, players }) => {
  const byGroup = new Map(groups.map((group) => [entityId(group), []]));
  for (const player of players) {
    const ids = new Set([player.groupId, ...(player.groupIds || [])].map(entityId).filter(Boolean));
    for (const id of ids) {
      byGroup.get(id)?.push({ ...player, attendanceGroupId: id });
    }
  }
  return groups.map((group) => ({ ...group, players: byGroup.get(entityId(group)) }));
};
