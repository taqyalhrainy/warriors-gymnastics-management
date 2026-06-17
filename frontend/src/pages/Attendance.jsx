import { useEffect, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { updateTodayAttendance, cancelTodayAttendance, fetchAttendanceByPlayer } from '../services/attendance.js';
import { fetchGroups, fetchGroupPlayers, reorderGroups as reorderGroupsRequest } from '../services/groups.js';
import { fetchParents } from '../services/parents.js';
import { getPlayer, updatePlayer } from '../services/players.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';

const packageOptions = [
  { label: '8 classes (1 hour)', classes: 8, hours: 1 },
  { label: '8 classes (1.5 hours)', classes: 8, hours: 1.5 },
  { label: '8 classes (2 hours)', classes: 8, hours: 2 },
  { label: '12 classes (1.5 hours)', classes: 12, hours: 1.5 },
  { label: '12 classes (2 hours)', classes: 12, hours: 2 },
  { label: '16 classes (1.5 hours)', classes: 16, hours: 1.5 },
  { label: '16 classes (2 hours)', classes: 16, hours: 2 }
];

const ATTENDANCE_BOARD_CACHE_TTL_MS = 5 * 60 * 1000;
let attendanceBoardCache = null;
let attendanceBoardCacheTimestamp = 0;

const AttendancePage = () => {
  const [groupColumns, setGroupColumns] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isEditingSelectedPlayer, setIsEditingSelectedPlayer] = useState(false);
  const [selectedPlayerForm, setSelectedPlayerForm] = useState(null);
  const [editParents, setEditParents] = useState([]);
  const [editGroups, setEditGroups] = useState([]);
  const [selectedSummaryGroup, setSelectedSummaryGroup] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredSummaryGroup, setHoveredSummaryGroup] = useState(null);
  const [search, setSearch] = useState('');
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [touchDragPreview, setTouchDragPreview] = useState(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const attendanceBoardRef = useRef(null);
  const touchHoldTimeoutRef = useRef(null);
  const draggedGroupIdRef = useRef(null);
  const dragOverGroupIdRef = useRef(null);
  const pointerDragActiveRef = useRef(false);
  const activePointerIdRef = useRef(null);
  const dragStartRectRef = useRef(null);
  const pointerHoldGroupIdRef = useRef(null);
  const pointerStartPointRef = useRef(null);
  const { t } = useLanguage();

  const isToday = (date) => {
    if (!date) return false;
    const recordDate = new Date(date);
    const today = new Date();
    return recordDate.toDateString() === today.toDateString();
  };

  const loadAttendanceBoard = async (options = {}) => {
    const force = Boolean(options.force);

    if (!force && attendanceBoardCache && (Date.now() - attendanceBoardCacheTimestamp) < ATTENDANCE_BOARD_CACHE_TTL_MS) {
      setGroupColumns(attendanceBoardCache);
      setIsLoading(false);
      return attendanceBoardCache;
    }

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
      attendanceBoardCache = groupsWithPlayers;
      attendanceBoardCacheTimestamp = Date.now();
      setGroupColumns(groupsWithPlayers);
      return groupsWithPlayers;
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to load attendance board');
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAttendanceBoard();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updateTouchDeviceState = () => {
      setIsTouchDevice(mediaQuery.matches || navigator.maxTouchPoints > 0);
    };

    updateTouchDeviceState();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateTouchDeviceState);
      return () => mediaQuery.removeEventListener('change', updateTouchDeviceState);
    }

    mediaQuery.addListener(updateTouchDeviceState);
    return () => mediaQuery.removeListener(updateTouchDeviceState);
  }, []);

  useEffect(() => {
    draggedGroupIdRef.current = draggedGroupId;
  }, [draggedGroupId]);

  useEffect(() => {
    dragOverGroupIdRef.current = dragOverGroupId;
  }, [dragOverGroupId]);

  useEffect(() => {
    const cancelPointerDrag = () => {
      clearTouchHold();
      pointerDragActiveRef.current = false;
      activePointerIdRef.current = null;
      dragStartRectRef.current = null;
      pointerHoldGroupIdRef.current = null;
      pointerStartPointRef.current = null;
      document.body.classList.remove('attendance-touch-dragging');
      setDraggedGroupId(null);
      setDragOverGroupId(null);
      setTouchDragPreview(null);
    };

    const handleWindowPointerMove = (event) => {
      if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || activePointerIdRef.current !== event.pointerId) {
        return;
      }

      if (touchHoldTimeoutRef.current && pointerStartPointRef.current) {
        const deltaX = Math.abs(event.clientX - pointerStartPointRef.current.x);
        const deltaY = Math.abs(event.clientY - pointerStartPointRef.current.y);
        if (deltaX > 18 || deltaY > 18) {
          clearTouchHold();
          activePointerIdRef.current = null;
          dragStartRectRef.current = null;
          pointerHoldGroupIdRef.current = null;
          pointerStartPointRef.current = null;
        }
      }

      if (!pointerDragActiveRef.current) {
        return;
      }

      event.preventDefault();
      if (dragStartRectRef.current && pointerStartPointRef.current) {
        setTouchDragPreview({
          x: dragStartRectRef.current.left + (event.clientX - pointerStartPointRef.current.x),
          y: dragStartRectRef.current.top + (event.clientY - pointerStartPointRef.current.y),
          width: dragStartRectRef.current.width,
          height: dragStartRectRef.current.height
        });
      }
      autoScrollBoard(event.clientX);
      const hoveredGroupId = findTouchedGroupId({ clientX: event.clientX, clientY: event.clientY });
      if (hoveredGroupId && hoveredGroupId !== dragOverGroupIdRef.current) {
        setDragOverGroupId(hoveredGroupId);
      }
    };

    const handleWindowPointerUp = async (event) => {
      if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || activePointerIdRef.current !== event.pointerId) {
        return;
      }

      clearTouchHold();

      if (!pointerDragActiveRef.current) {
        activePointerIdRef.current = null;
        dragStartRectRef.current = null;
        pointerHoldGroupIdRef.current = null;
        pointerStartPointRef.current = null;
        return;
      }

      const sourceGroupId = draggedGroupIdRef.current;
      const targetGroupId = dragOverGroupIdRef.current;
      cancelPointerDrag();

      if (sourceGroupId && targetGroupId && sourceGroupId !== targetGroupId) {
        await commitReorder(sourceGroupId, targetGroupId);
      }
    };

    const handleWindowPointerCancel = () => {
      cancelPointerDrag();
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [groupColumns]);

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

  const handleDragStart = (event, groupId) => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', groupId);
    }
    setDraggedGroupId(groupId);
    setDragOverGroupId(groupId);
  };

  const handleDragOver = (event, groupId) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
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
      await loadAttendanceBoard({ force: true });
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to update group order');
      await loadAttendanceBoard({ force: true });
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

  const autoScrollBoard = (clientX) => {
    const boardElement = attendanceBoardRef.current;
    if (!boardElement) {
      return;
    }

    const boardRect = boardElement.getBoundingClientRect();
    const edgeThreshold = 72;
    const scrollStep = 18;

    if (clientX < boardRect.left + edgeThreshold) {
      boardElement.scrollBy({ left: -scrollStep, behavior: 'auto' });
    } else if (clientX > boardRect.right - edgeThreshold) {
      boardElement.scrollBy({ left: scrollStep, behavior: 'auto' });
    }
  };

  const getGroupStyle = (group) => {
    if (!isTouchDevice || draggedGroupId !== group._id || !touchDragPreview) {
      return { '--group-color': group.color };
    }

    return {
      '--group-color': group.color,
      position: 'fixed',
      left: `${touchDragPreview.x}px`,
      top: `${touchDragPreview.y}px`,
      width: `${touchDragPreview.width}px`,
      height: `${touchDragPreview.height}px`,
      zIndex: 1200,
      pointerEvents: 'none',
      transform: 'rotate(1deg) scale(0.98)',
      opacity: 0.96
    };
  };

  const handlePointerDown = (event, groupId) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      return;
    }

    clearTouchHold();
    activePointerIdRef.current = event.pointerId;
    pointerHoldGroupIdRef.current = groupId;
    pointerStartPointRef.current = { x: event.clientX, y: event.clientY };
    dragStartRectRef.current = event.currentTarget.closest('[data-group-id]')?.getBoundingClientRect() || null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    touchHoldTimeoutRef.current = setTimeout(() => {
      const activeRect = event.currentTarget.closest('[data-group-id]')?.getBoundingClientRect();
      dragStartRectRef.current = activeRect || dragStartRectRef.current;
      pointerDragActiveRef.current = true;
      document.body.classList.add('attendance-touch-dragging');
      setDraggedGroupId(groupId);
      setDragOverGroupId(groupId);
      if (dragStartRectRef.current) {
        setTouchDragPreview({
          x: dragStartRectRef.current.left,
          y: dragStartRectRef.current.top,
          width: dragStartRectRef.current.width,
          height: dragStartRectRef.current.height
        });
      }
      setMessage('Drag the group to a new position');
    }, 450);
  };

  const updatePlayerInBoard = (playerId, updater) => {
    setGroupColumns((currentGroups) => currentGroups.map((group) => {
      let changed = false;
      const nextPlayers = group.players.map((player) => {
        if (player._id !== playerId) {
          return player;
        }

        changed = true;
        return updater(player, group);
      });

      if (!changed) {
        return group;
      }

      const markedCount = nextPlayers.filter((item) => Boolean(item.todayAttendance)).length;
      const presentCount = nextPlayers.filter((item) => item.todayAttendance?.status === 'present').length;

      return {
        ...group,
        players: nextPlayers,
        markedCount,
        presentCount
      };
    }));
  };

  const handleAction = async (player, groupId, status) => {
    try {
      setMessage('');
      await updateTodayAttendance({ playerId: player._id, groupId, status });
      setMessage('Attendance recorded');
      const optimisticAttendance = {
        ...(player.todayAttendance || {}),
        status,
        date: new Date().toISOString(),
        checkInTime: new Date().toISOString()
      };

      updatePlayerInBoard(player._id, (currentPlayer) => ({
        ...currentPlayer,
        todayAttendance: optimisticAttendance
      }));

      if (selectedPlayer?._id === player._id) {
        const history = await fetchAttendanceByPlayer(player._id);
        setAttendanceHistory(history);
        setSelectedPlayer((currentPlayer) => currentPlayer ? {
          ...currentPlayer,
          todayAttendance: optimisticAttendance
        } : currentPlayer);
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
      updatePlayerInBoard(player._id, (currentPlayer) => ({
        ...currentPlayer,
        todayAttendance: null
      }));

      if (selectedPlayer?._id === player._id) {
        const history = await fetchAttendanceByPlayer(player._id);
        setAttendanceHistory(history);
        setSelectedPlayer((currentPlayer) => currentPlayer ? {
          ...currentPlayer,
          todayAttendance: null
        } : currentPlayer);
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
      setIsEditingSelectedPlayer(false);
      setSelectedPlayerForm(null);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to load student card');
    }
  };

  const createSelectedPlayerForm = (player) => ({
    fullName: player?.fullName || '',
    parentId: player?.parentId?._id || '',
    parentPhone: player?.parentPhone || '',
    groupIds: player?.groupIds?.length ? player.groupIds.map((group) => group._id || group) : (player?.groupId?._id ? [player.groupId._id] : []),
    startDate: player?.startDate?.split?.('T')?.[0] || '',
    endDate: player?.endDate?.split?.('T')?.[0] || '',
    packageName: player?.packageName || '',
    packageClasses: player?.packageClasses ?? '',
    packageHours: player?.packageHours ?? '',
    payment: player?.payment ?? '',
    note: player?.note || '',
    status: player?.status || 'active'
  });

  const handleStartEditSelectedPlayer = async () => {
    if (!selectedPlayer?._id) {
      return;
    }

    try {
      setMessage('');
      setIsEditingSelectedPlayer(true);
      setSelectedPlayerForm(createSelectedPlayerForm(selectedPlayer));

      const [parentsData, groupsData, latestPlayer] = await Promise.all([
        fetchParents(),
        fetchGroups(),
        getPlayer(selectedPlayer._id)
      ]);

      setEditParents(parentsData);
      setEditGroups(groupsData);
      setSelectedPlayer(latestPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(latestPlayer));
    } catch (err) {
      setIsEditingSelectedPlayer(false);
      setSelectedPlayerForm(null);
      setMessage(err.response?.data?.message || 'Unable to open player editor');
    }
  };

  const handleSelectedPlayerFormChange = (event) => {
    const { name, value } = event.target;

    if (name === 'parentId') {
      const selectedParent = editParents.find((parent) => parent._id === value);
      setSelectedPlayerForm((current) => ({
        ...current,
        parentId: value,
        parentPhone: selectedParent?.phone || current.parentPhone || ''
      }));
      return;
    }

    if (name === 'packageName') {
      const selectedPackage = packageOptions.find((option) => option.label === value);
      setSelectedPlayerForm((current) => ({
        ...current,
        packageName: value,
        packageClasses: selectedPackage ? selectedPackage.classes : '',
        packageHours: selectedPackage ? selectedPackage.hours : ''
      }));
      return;
    }

    if (name === 'payment' || name === 'packageClasses' || name === 'packageHours') {
      setSelectedPlayerForm((current) => ({ ...current, [name]: normalizeDigits(value) }));
      return;
    }

    setSelectedPlayerForm((current) => ({ ...current, [name]: value }));
  };

  const handleSelectedPlayerGroupToggle = (groupId) => {
    setSelectedPlayerForm((current) => {
      const nextGroupIds = current.groupIds.includes(groupId)
        ? current.groupIds.filter((id) => id !== groupId)
        : [...current.groupIds, groupId];

      return {
        ...current,
        groupIds: nextGroupIds
      };
    });
  };

  const handleCancelSelectedPlayerEdit = () => {
    setIsEditingSelectedPlayer(false);
    setSelectedPlayerForm(selectedPlayer ? createSelectedPlayerForm(selectedPlayer) : null);
  };

  const handleSaveSelectedPlayerEdit = async (event) => {
    event.preventDefault();
    if (!selectedPlayer?._id || !selectedPlayerForm) {
      return;
    }

    try {
      setMessage('');
      await updatePlayer(selectedPlayer._id, {
        ...selectedPlayerForm,
        groupId: selectedPlayerForm.groupIds[0] || '',
        groupIds: selectedPlayerForm.groupIds,
        packageClasses: parseLocalizedNumber(selectedPlayerForm.packageClasses),
        packageHours: parseLocalizedNumber(selectedPlayerForm.packageHours),
        payment: parseLocalizedNumber(selectedPlayerForm.payment)
      });

      const [history, refreshedPlayer] = await Promise.all([
        fetchAttendanceByPlayer(selectedPlayer._id),
        getPlayer(selectedPlayer._id)
      ]);

      setAttendanceHistory(history);
      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setIsEditingSelectedPlayer(false);
      setMessage('Player updated successfully');
      await loadAttendanceBoard({ force: true });
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to update player');
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
          <button type="button" className="btn-secondary" onClick={() => loadAttendanceBoard({ force: true })}>{t('refresh')}</button>
        </div>

        {isLoading ? (
          <div className="form-card">{t('loadingAttendanceBoard')}</div>
        ) : (
          <div className="attendance-board" ref={attendanceBoardRef}>
            {filteredGroupColumns.map((group) => (
              <section
                className={`attendance-group attendance-group-marked${draggedGroupId === group._id ? ' is-dragging' : ''}${dragOverGroupId === group._id && draggedGroupId !== group._id ? ' is-drag-target' : ''}`}
                key={group._id}
                data-group-id={group._id}
                style={getGroupStyle(group)}
                draggable={!isTouchDevice}
                onDragStart={(event) => handleDragStart(event, group._id)}
                onDragOver={(event) => handleDragOver(event, group._id)}
                onDrop={() => handleDrop(group._id)}
                onDragEnd={handleDragEnd}
              >
                <div
                  className="attendance-group-header"
                  onPointerDown={(event) => handlePointerDown(event, group._id)}
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
                        {player.todayAttendance && (
                          <em className={`attendance-status-pill attendance-status-pill-${player.todayAttendance.status}`}>
                            {player.todayAttendance.status}
                          </em>
                        )}
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
                <div className="student-modal-header-actions">
                  {!isEditingSelectedPlayer && (
                    <button type="button" className="btn-primary" onClick={handleStartEditSelectedPlayer}>{t('edit')}</button>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => setSelectedPlayer(null)}>{t('close')}</button>
                </div>
              </div>

              {isEditingSelectedPlayer && selectedPlayerForm ? (
                <form className="student-modal-edit-form" onSubmit={handleSaveSelectedPlayerEdit}>
                  <div className="student-modal-edit-grid">
                    <label>
                      <span>{t('name')}</span>
                      <input name="fullName" value={selectedPlayerForm.fullName} onChange={handleSelectedPlayerFormChange} required />
                    </label>
                    <label>
                      <span>{t('parent')}</span>
                      <select name="parentId" value={selectedPlayerForm.parentId} onChange={handleSelectedPlayerFormChange} required>
                        <option value="">{t('selectParent')}</option>
                        {editParents.map((parent) => (
                          <option key={parent._id} value={parent._id}>
                            {parent.phone ? `${parent.name} (${parent.phone})` : parent.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t('parentPhone')}</span>
                      <input name="parentPhone" value={selectedPlayerForm.parentPhone} onChange={handleSelectedPlayerFormChange} />
                    </label>
                    <label>
                      <span>{t('status')}</span>
                      <select name="status" value={selectedPlayerForm.status} onChange={handleSelectedPlayerFormChange}>
                        <option value="active">{t('activeStatus')}</option>
                        <option value="expired">{t('expiredStatus')}</option>
                        <option value="frozen">{t('frozenStatus')}</option>
                        <option value="left">{t('leftStatus')}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t('startDate')}</span>
                      <input name="startDate" type="date" value={selectedPlayerForm.startDate} onChange={handleSelectedPlayerFormChange} />
                    </label>
                    <label>
                      <span>{t('endDate')}</span>
                      <input name="endDate" type="date" value={selectedPlayerForm.endDate} onChange={handleSelectedPlayerFormChange} />
                    </label>
                    <label>
                      <span>{t('package')}</span>
                      <select name="packageName" value={selectedPlayerForm.packageName} onChange={handleSelectedPlayerFormChange}>
                        <option value="">{t('selectPackage')}</option>
                        {packageOptions.map((option) => (
                          <option key={option.label} value={option.label}>{option.label}</option>
                        ))}
                        <option value="custom">{t('customPackage')}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t('payment')}</span>
                      <input name="payment" type="text" inputMode="decimal" value={selectedPlayerForm.payment} onChange={handleSelectedPlayerFormChange} />
                    </label>
                    <label>
                      <span>{t('classes')}</span>
                      <input name="packageClasses" type="text" inputMode="numeric" value={selectedPlayerForm.packageClasses} onChange={handleSelectedPlayerFormChange} />
                    </label>
                    <label>
                      <span>{t('hours')}</span>
                      <input name="packageHours" type="text" inputMode="decimal" value={selectedPlayerForm.packageHours} onChange={handleSelectedPlayerFormChange} />
                    </label>
                    <label className="student-modal-edit-grid-full">
                      <span>{t('note')}</span>
                      <textarea name="note" value={selectedPlayerForm.note} onChange={handleSelectedPlayerFormChange} placeholder={t('discountNotePlaceholder')} />
                    </label>
                  </div>

                  <div className="student-modal-edit-groups">
                    <span>{t('group')}</span>
                    <div className="multi-select-list">
                      {editGroups.length ? editGroups.map((group) => (
                        <label className="multi-select-option" key={group._id}>
                          <input
                            type="checkbox"
                            checked={selectedPlayerForm.groupIds.includes(group._id)}
                            onChange={() => handleSelectedPlayerGroupToggle(group._id)}
                          />
                          <span>
                            <strong>{group.name}</strong>
                            <small>{[group.days?.join(', '), [group.startTime, group.endTime].filter(Boolean).join(' - ')].filter(Boolean).join(' | ')}</small>
                          </span>
                        </label>
                      )) : <p className="empty-state">{t('noGroupsFound')}</p>}
                    </div>
                  </div>

                  <div className="student-modal-edit-actions">
                    <button type="submit" className="btn-primary">{t('savePlayer')}</button>
                    <button type="button" className="btn-secondary" onClick={handleCancelSelectedPlayerEdit}>{t('cancel')}</button>
                  </div>
                </form>
              ) : (
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
              )}

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
