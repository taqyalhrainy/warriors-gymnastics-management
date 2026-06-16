import { useEffect, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { updateTodayAttendance, cancelTodayAttendance, fetchAttendanceByPlayer } from '../services/attendance.js';
import { fetchGroups, fetchGroupPlayers, reorderGroups as reorderGroupsRequest } from '../services/groups.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const AttendancePage = () => {
  const [groupColumns, setGroupColumns] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedSummaryGroup, setSelectedSummaryGroup] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredSummaryGroup, setHoveredSummaryGroup] = useState(null);
  const [search, setSearch] = useState('');
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const touchHoldTimeoutRef = useRef(null);
  const touchDragActiveRef = useRef(false);
  const { t } = useLanguage();

  const isToday = (date) => {
    if (!date) return false;
    const recordDate = new Date(date);
    const today = new Date();
    return recordDate.toDateString() === today.toDateString();
  };

  const loadAttendanceBoard = async () => {
    try {
      setIsLoading(true);
      const groups = await fetchGroups();
      const groupsWithPlayers = await Promise.all(
        groups.map(async (group) => {
          const players = await fetchGroupPlayers(group._id);
          const todayRecords = await Promise.all(
            players.map(async (player) => {
              try {
                const history = await fetchAttendanceByPlayer(player._id);
                return history.find((record) => isToday(record.date));
              } catch (error) {
                console.error(error);
                return null;
              }
            })
          );
          const markedCount = todayRecords.filter(Boolean).length;
          const presentCount = todayRecords.filter((record) => record?.status === 'present').length;

          return {
            ...group,
            players: players.map((player, playerIndex) => ({
              ...player,
              todayAttendance: todayRecords[playerIndex] || null
            })),
            color: group.color,
            markedCount,
            presentCount
          };
        })
      );
      setGroupColumns(groupsWithPlayers);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to load attendance board');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAttendanceBoard();
  }, []);

  useEffect(() => () => {
    if (touchHoldTimeoutRef.current) {
      clearTimeout(touchHoldTimeoutRef.current);
    }
  }, []);

  const reorderGroups = (items, fromGroupId, toGroupId) => {
    const nextItems = [...items];
    const fromIndex = nextItems.findIndex((group) => group._id === fromGroupId);
    const toIndex = nextItems.findIndex((group) => group._id === toGroupId);

    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return items;
    }

    const [movedGroup] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, movedGroup);
    return nextItems;
  };

  const handleDragStart = (groupId) => {
    setDraggedGroupId(groupId);
    setDragOverGroupId(groupId);
  };

  const handleDragOver = (event, groupId) => {
    event.preventDefault();
    if (dragOverGroupId !== groupId) {
      setDragOverGroupId(groupId);
    }
  };

  const commitReorder = async (fromGroupId, targetGroupId) => {
    if (!fromGroupId || fromGroupId === targetGroupId) {
      return;
    }

    const reorderedGroups = reorderGroups(groupColumns, fromGroupId, targetGroupId);
    setGroupColumns(reorderedGroups);

    try {
      await reorderGroupsRequest(reorderedGroups.map((group) => group._id));
      setMessage('Group order updated');
      await loadAttendanceBoard();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to update group order');
      await loadAttendanceBoard();
    }
  };

  const handleDrop = async (targetGroupId) => {
    if (!draggedGroupId || draggedGroupId === targetGroupId) {
      setDraggedGroupId(null);
      setDragOverGroupId(null);
      return;
    }

    const sourceGroupId = draggedGroupId;
    setDraggedGroupId(null);
    setDragOverGroupId(null);
    await commitReorder(sourceGroupId, targetGroupId);
  };

  const handleDragEnd = () => {
    setDraggedGroupId(null);
    setDragOverGroupId(null);
  };

  const clearTouchHold = () => {
    if (touchHoldTimeoutRef.current) {
      clearTimeout(touchHoldTimeoutRef.current);
      touchHoldTimeoutRef.current = null;
    }
  };

  const findTouchedGroupId = (touch) => {
    const touchedElement = document.elementFromPoint(touch.clientX, touch.clientY);
    return touchedElement?.closest('[data-group-id]')?.getAttribute('data-group-id') || null;
  };

  const handleTouchStart = (groupId) => {
    clearTouchHold();
    touchHoldTimeoutRef.current = setTimeout(() => {
      touchDragActiveRef.current = true;
      setDraggedGroupId(groupId);
      setDragOverGroupId(groupId);
      setMessage('Drag the group to a new position');
    }, 350);
  };

  const handleTouchMove = (event) => {
    if (!touchDragActiveRef.current) {
      return;
    }

    event.preventDefault();
    const touch = event.touches[0];
    const hoveredGroupId = touch ? findTouchedGroupId(touch) : null;
    if (hoveredGroupId && hoveredGroupId !== dragOverGroupId) {
      setDragOverGroupId(hoveredGroupId);
    }
  };

  const handleTouchEnd = async () => {
    clearTouchHold();

    if (!touchDragActiveRef.current) {
      return;
    }

    touchDragActiveRef.current = false;
    const sourceGroupId = draggedGroupId;
    const targetGroupId = dragOverGroupId;
    setDraggedGroupId(null);
    setDragOverGroupId(null);

    if (sourceGroupId && targetGroupId && sourceGroupId !== targetGroupId) {
      await commitReorder(sourceGroupId, targetGroupId);
    }
  };

  const handleTouchCancel = () => {
    clearTouchHold();
    touchDragActiveRef.current = false;
    setDraggedGroupId(null);
    setDragOverGroupId(null);
  };

  const handleAction = async (player, groupId, status) => {
    try {
      setMessage('');
      await updateTodayAttendance({ playerId: player._id, groupId, status });
      setMessage('Attendance recorded');
      await loadAttendanceBoard();
      if (selectedPlayer?._id === player._id) {
        const history = await fetchAttendanceByPlayer(player._id);
        setAttendanceHistory(history);
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to record attendance');
    }
  };

  const handleCancelAttendance = async (player) => {
    try {
      setMessage('');
      await cancelTodayAttendance({ playerId: player._id });
      setMessage('Attendance cancelled');
      await loadAttendanceBoard();
      if (selectedPlayer?._id === player._id) {
        const history = await fetchAttendanceByPlayer(player._id);
        setAttendanceHistory(history);
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to cancel attendance');
    }
  };

  const handleSelectPlayer = async (player) => {
    try {
      setMessage('');
      const history = await fetchAttendanceByPlayer(player._id);
      setAttendanceHistory(history);
      setSelectedPlayer(player);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to load student card');
    }
  };

  const formatDate = (date) => date ? new Date(date).toLocaleDateString() : t('notSet');
  const formatGroupTime = (group) => [group.startTime, group.endTime].filter(Boolean).join(' - ');
  const getPlayerGroups = (player) => {
    const groups = player?.groupIds?.length ? player.groupIds : [player?.groupId].filter(Boolean);
    return groups.map((group) => group?.name).filter(Boolean).join(', ');
  };
  const filteredGroupColumns = groupColumns
    .map((group) => {
      const query = search.trim().toLowerCase();
      if (!query) return group;
      const groupMatches = [
        group.name,
        group.days?.join(' '),
        group.startTime,
        group.endTime
      ].join(' ').toLowerCase().includes(query);
      const players = group.players.filter((player) => [
        player.fullName,
        player.parentId?.name,
        player.status,
        player.todayAttendance?.status
      ].join(' ').toLowerCase().includes(query));
      return groupMatches ? group : { ...group, players };
    })
    .filter((group) => !search.trim() || group.players.length || [
      group.name,
      group.days?.join(' '),
      group.startTime,
      group.endTime
    ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const attendedGroups = groupColumns.filter((group) => group.markedCount > 0);
  const presentGroups = attendedGroups.filter((group) => group.presentCount > 0);
  const totalPresent = presentGroups.reduce((sum, group) => sum + group.presentCount, 0);
  const donutRadius = 46;
  const donutCenter = 60;
  const donutStrokeWidth = 14;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let donutOffset = 0;
  const donutSegments = presentGroups.map((group) => {
    const segmentLength = totalPresent ? (group.presentCount / totalPresent) * donutCircumference : 0;
    const startOffset = donutOffset;
    const startAngle = (startOffset / donutCircumference) * Math.PI * 2;
    const segment = {
      ...group,
      dashLength: Math.max(0, segmentLength),
      dashOffset: -startOffset,
      capX: donutCenter + donutRadius * Math.cos(startAngle),
      capY: donutCenter + donutRadius * Math.sin(startAngle)
    };
    donutOffset += segmentLength;
    return segment;
  });

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <div>
            <h1>{t('attendance')}</h1>
            <p className="page-subtitle">{t('attendanceSubtitle')}</p>
          </div>
          <div className="attendance-summary-card" aria-label="Attendance summary">
            <div className="attendance-donut">
              <svg viewBox="0 0 120 120" role="img">
                <circle className="attendance-donut-track" cx="60" cy="60" r={donutRadius} />
                {donutSegments.map((group) => (
                  <circle
                    className="attendance-donut-segment"
                    cx="60"
                    cy="60"
                    key={group._id}
                    r={donutRadius}
                    stroke={group.color}
                    strokeDasharray={`${group.dashLength} ${donutCircumference}`}
                    strokeDashoffset={group.dashOffset}
                    onMouseEnter={() => setHoveredSummaryGroup(group)}
                    onMouseLeave={() => setHoveredSummaryGroup(null)}
                    onClick={() => setSelectedSummaryGroup(group)}
                  />
                ))}
                {donutSegments.map((group) => (
                  <circle
                    className="attendance-donut-cap"
                    cx={group.capX}
                    cy={group.capY}
                    fill={group.color}
                    key={`${group._id}-cap`}
                    r={donutStrokeWidth / 2}
                    onMouseEnter={() => setHoveredSummaryGroup(group)}
                    onMouseLeave={() => setHoveredSummaryGroup(null)}
                    onClick={() => setSelectedSummaryGroup(group)}
                  />
                ))}
              </svg>
              <div className="attendance-donut-center">
                <strong>{totalPresent}</strong>
                <span>{t('total')}</span>
              </div>
              {hoveredSummaryGroup && (
                <div className="attendance-donut-tooltip">
                  <strong>{hoveredSummaryGroup.name}</strong>
                  <span>{hoveredSummaryGroup.presentCount}/{hoveredSummaryGroup.players.length}</span>
                  <small>{t('clickForDetails')}</small>
                </div>
              )}
            </div>
            <div className="attendance-summary-legend">
              {attendedGroups.length ? attendedGroups.map((group) => (
                <span
                  key={group._id}
                  onClick={() => setSelectedSummaryGroup(group)}
                >
                  <i style={{ background: group.color }} />
                  {group.presentCount}/{group.players.length}
                </span>
              )) : <span><i />0/0</span>}
            </div>
          </div>
        </div>

        <div className="attendance-toolbar">
          {message && <p className="alert-info">{message}</p>}
          <label className="table-search attendance-search">
            <span>Search</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students or groups..." />
          </label>
          <button type="button" className="btn-secondary" onClick={loadAttendanceBoard}>{t('refresh')}</button>
        </div>

        {isLoading ? (
          <div className="form-card">{t('loadingAttendanceBoard')}</div>
        ) : (
          <div className="attendance-board">
            {filteredGroupColumns.map((group) => (
              <section
                className={`attendance-group attendance-group-marked${draggedGroupId === group._id ? ' is-dragging' : ''}${dragOverGroupId === group._id && draggedGroupId !== group._id ? ' is-drag-target' : ''}`}
                key={group._id}
                data-group-id={group._id}
                style={{ '--group-color': group.color }}
                draggable
                onDragStart={() => handleDragStart(group._id)}
                onDragOver={(event) => handleDragOver(event, group._id)}
                onDrop={() => handleDrop(group._id)}
                onDragEnd={handleDragEnd}
              >
                <div
                  className="attendance-group-header"
                  onTouchStart={() => handleTouchStart(group._id)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchCancel}
                >
                  <div>
                    <h2>{group.name}</h2>
                    <p>
                      {group.days?.join(', ') || t('noDaysSet')}
                      {formatGroupTime(group) && ` | ${formatGroupTime(group)}`}
                    </p>
                  </div>
                  <div className="attendance-group-header-meta">
                    <span>{group.players.length}/{group.maxCapacity || '-'}</span>
                    <small>Drag</small>
                  </div>
                </div>

                <div className="attendance-player-list">
                  {group.players.length ? group.players.map((player) => (
                    <article className="attendance-player-card" key={player._id}>
                      <button type="button" className="attendance-player-main" onClick={() => handleSelectPlayer(player)}>
                        <strong>{player.fullName}</strong>
                        <span>{player.parentId?.name || t('noParent')} | {player.status}</span>
                        {player.todayAttendance && <em>{player.todayAttendance.status}</em>}
                      </button>
                      <div className="attendance-actions">
                        <button
                          type="button"
                          className={`btn-present ${player.todayAttendance?.status === 'present' ? 'active' : ''}`}
                          onClick={() => handleAction(player, group._id, 'present')}
                        >
                          {t('present')}
                        </button>
                        <button
                          type="button"
                          className={`btn-absent ${player.todayAttendance?.status === 'absent' ? 'active' : ''}`}
                          onClick={() => handleAction(player, group._id, 'absent')}
                        >
                          {t('absent')}
                        </button>
                        {player.todayAttendance && (
                          <button
                            type="button"
                            className="btn-cancel-attendance"
                            onClick={() => handleCancelAttendance(player)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </article>
                  )) : <p className="empty-state">{t('noStudentsInGroup')}</p>}
                </div>
              </section>
            ))}
          </div>
        )}

        {selectedPlayer && (
          <div className="student-modal-backdrop" role="presentation" onClick={() => setSelectedPlayer(null)}>
            <section className="student-modal" role="dialog" aria-modal="true" aria-label={t('studentDetails')} onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div>
                  <h2>{selectedPlayer.fullName}</h2>
                  <p>{getPlayerGroups(selectedPlayer) || t('noGroupAssigned')}</p>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setSelectedPlayer(null)}>{t('close')}</button>
              </div>

              <div className="student-info-grid">
                <div><span>{t('status')}</span><strong>{selectedPlayer.status || t('notSet')}</strong></div>
                <div><span>{t('birthDate')}</span><strong>{formatDate(selectedPlayer.dateOfBirth)}</strong></div>
                <div><span>{t('parent')}</span><strong>{selectedPlayer.parentId?.name || t('notSet')}</strong></div>
                <div><span>{t('parentPhone')}</span><strong>{selectedPlayer.parentPhone || t('notSet')}</strong></div>
                <div><span>{t('program')}</span><strong>{selectedPlayer.programId?.name || t('notSet')}</strong></div>
                <div><span>{t('coach')}</span><strong>{selectedPlayer.coachId?.name || t('notSet')}</strong></div>
                <div><span>{t('level')}</span><strong>{selectedPlayer.level || t('notSet')}</strong></div>
                <div><span>{t('subscription')}</span><strong>{selectedPlayer.subscriptionId?.status || t('notSet')}</strong></div>
                <div><span>{t('remainingSessions')}</span><strong>{selectedPlayer.subscriptionId?.remainingSessions ?? t('notSet')}</strong></div>
                <div><span>{t('subscriptionEnds')}</span><strong>{formatDate(selectedPlayer.subscriptionId?.endDate)}</strong></div>
              </div>

              <div className="student-history">
                <h3>{t('attendanceHistory')}</h3>
                {attendanceHistory.length ? (
                  <div className="student-history-list">
                    {attendanceHistory.slice(0, 8).map((record) => (
                      <div className="student-history-row" key={record._id}>
                        <span>{new Date(record.date).toLocaleDateString()}</span>
                        <strong>{record.status}</strong>
                        <span>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-state">{t('noAttendanceHistory')}</p>}
              </div>
            </section>
          </div>
        )}

        {selectedSummaryGroup && (
          <div className="student-modal-backdrop" role="presentation" onClick={() => setSelectedSummaryGroup(null)}>
            <section className="student-modal group-details-modal" role="dialog" aria-modal="true" aria-label={t('groupDetails')} onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div>
                  <h2>{selectedSummaryGroup.name}</h2>
                  <p>{t('schedule')}: {selectedSummaryGroup.days?.join(', ') || t('noDaysSet')} {formatGroupTime(selectedSummaryGroup) && `| ${formatGroupTime(selectedSummaryGroup)}`}</p>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setSelectedSummaryGroup(null)}>{t('close')}</button>
              </div>
              <div className="group-details-summary">
                <span><i style={{ background: selectedSummaryGroup.color }} />{selectedSummaryGroup.presentCount}/{selectedSummaryGroup.players.length}</span>
              </div>
              <div className="student-history-list">
                {selectedSummaryGroup.players.length ? selectedSummaryGroup.players.map((player) => (
                  <div className="student-history-row" key={player._id}>
                    <span>{player.fullName}</span>
                    <strong>{player.todayAttendance?.status || t('notSet')}</strong>
                    <span>{player.parentId?.name || t('noParent')}</span>
                  </div>
                )) : <p className="empty-state">{t('noStudentsInGroup')}</p>}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default AttendancePage;
