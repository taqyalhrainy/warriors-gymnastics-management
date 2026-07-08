import { useEffect, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { updateTodayAttendance, cancelTodayAttendance, fetchAttendanceByPlayer, fetchTodayAttendance } from '../services/attendance.js';
import { fetchGroups, fetchGroupPlayers, reorderGroups as reorderGroupsRequest } from '../services/groups.js';
import { fetchHistorySnapshot } from '../services/history.js';
import { fetchParents } from '../services/parents.js';
import { getPlayer, updatePlayer } from '../services/players.js';
import { fetchPackageOptions } from '../services/packageOptions.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';
import { getCacheVersion } from '../services/cache.js';

const ATTENDANCE_BOARD_CACHE_TTL_MS = 5 * 60 * 1000;
let attendanceBoardCache = null;
let attendanceBoardCacheTimestamp = 0;
let attendanceBoardCacheDate = '';
let attendanceBoardCacheVersion = -1;

const getLocalDateValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateInputValue = (date = new Date()) => {
  if (!date) return '';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return getLocalDateValue(value);
};

const getLocalDateOnly = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const getObjectIdDate = (id) => {
  const value = String(id || '');
  if (!/^[a-f\d]{24}$/i.test(value)) {
    return null;
  }
  return new Date(parseInt(value.slice(0, 8), 16) * 1000);
};

const getAttendanceRangeStartValue = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return getLocalDateValue(date);
};

const getHistorySnapshotIsoForDate = (dateValue) => new Date(`${dateValue}T23:59:59.999`).toISOString();

const getEntityId = (value) => String(value?._id || value || '');
const getAttendanceRecordKey = (playerId, groupId) => `${getEntityId(playerId)}:${getEntityId(groupId)}`;

const isPlayerVisibleInAttendance = (player) => !player?.isDeleted && player?.status !== 'left';
const isPlayerFrozen = (player) => player?.status === 'frozen';

const getPlayerPackageCounter = (player) => {
  const subscription = player?.subscriptionId && typeof player.subscriptionId === 'object'
    ? player.subscriptionId
    : null;
  const total = Number(subscription?.totalSessions || player?.packageClasses || 0);
  const used = Number(player?.attendancePresentCount ?? subscription?.usedSessions ?? 0);

  return {
    used: Math.max(0, used),
    total: Math.max(0, total)
  };
};

const isPlayerSubscriptionExpired = (player) => {
  if (!player) {
    return false;
  }

  if (isPlayerFrozen(player)) {
    return false;
  }

  if (player.subscriptionNeedsAttention) {
    return true;
  }

  if (player.status === 'expired') {
    return true;
  }

  const subscription = player.subscriptionId && typeof player.subscriptionId === 'object'
    ? player.subscriptionId
    : null;

  const endDate = subscription?.endDate || player.endDate;
  if (endDate && getLocalDateOnly(endDate) <= getLocalDateOnly()) {
    return true;
  }

  const { total: packageClasses, used: usedClasses } = getPlayerPackageCounter(player);
  if (packageClasses > 0 && usedClasses >= packageClasses) {
    return true;
  }

  return false;
};

const getSnapshotGroups = (player) => {
  if (Array.isArray(player?.groupIds) && player.groupIds.length) {
    return player.groupIds
      .map((group) => ({
        _id: group?._id || group,
        name: group?.name || ''
      }))
      .filter((group) => group._id);
  }

  if (player?.groupId) {
    return [{
      _id: player.groupId,
      name: player.groupName || ''
    }];
  }

  return [];
};

const mapSnapshotPlayerToAttendancePlayer = (player) => {
  const groups = getSnapshotGroups(player);
  const firstGroup = groups[0] || null;

  return {
    _id: player._id,
    fullName: player.fullName || '',
    dateOfBirth: player.dateOfBirth || null,
    parentId: (player.parentId || player.parentName) ? {
      _id: player.parentId || '',
      name: player.parentName || ''
    } : null,
    parentPhone: player.parentPhone || '',
    programId: player.programId ? {
      _id: player.programId,
      name: player.programName || ''
    } : null,
    coachId: player.coachId ? {
      _id: player.coachId,
      name: player.coachName || ''
    } : null,
    subscriptionId: player.subscriptionId || '',
    groupId: firstGroup ? { ...firstGroup } : null,
    groupIds: groups.map((group) => ({ ...group })),
    level: player.level || '',
    startDate: player.startDate || null,
    endDate: player.endDate || null,
    packageName: player.packageName || '',
    packageClasses: Number(player.packageClasses || 0),
    packageHours: Number(player.packageHours || 0),
    payment: Number(player.payment || 0),
    note: player.note || '',
    status: player.status || '',
    profileImage: player.profileImage || '',
    createdAt: player.createdAt || null
  };
};

const AttendancePage = () => {
  const [groupColumns, setGroupColumns] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedPlayerAttendanceHistory, setSelectedPlayerAttendanceHistory] = useState([]);
  const [showSelectedPlayerAttendanceHistory, setShowSelectedPlayerAttendanceHistory] = useState(false);
  const [editingAttendanceHistoryId, setEditingAttendanceHistoryId] = useState(null);
  const [pendingAttendanceHistoryId, setPendingAttendanceHistoryId] = useState(null);
  const [isEditingSelectedPlayer, setIsEditingSelectedPlayer] = useState(false);
  const [selectedPlayerForm, setSelectedPlayerForm] = useState(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState({ startDate: '', endDate: '' });
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const [isSavingSubscription, setIsSavingSubscription] = useState(false);
  const [editParents, setEditParents] = useState([]);
  const [editGroups, setEditGroups] = useState([]);
  const [packageOptions, setPackageOptions] = useState([]);
  const [selectedSummaryGroup, setSelectedSummaryGroup] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredSummaryGroup, setHoveredSummaryGroup] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState(() => getLocalDateValue());
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);
  const [touchDragPreview, setTouchDragPreview] = useState(null);
  const [isCoarsePointerDevice, setIsCoarsePointerDevice] = useState(false);
  const [pendingAttendanceKeys, setPendingAttendanceKeys] = useState([]);
  const attendanceBoardRef = useRef(null);
  const attendanceLoadRequestIdRef = useRef(0);
  const groupColumnsRef = useRef([]);
  const touchHoldTimeoutRef = useRef(null);
  const draggedGroupIdRef = useRef(null);
  const dragOverGroupIdRef = useRef(null);
  const pointerDragActiveRef = useRef(false);
  const activePointerIdRef = useRef(null);
  const dragStartRectRef = useRef(null);
  const pointerHoldGroupIdRef = useRef(null);
  const pointerStartPointRef = useRef(null);
  const attendanceDateInputRef = useRef(null);
  const pendingAttendanceKeysRef = useRef(new Set());
  const pendingAttendanceHistoryIdRef = useRef(null);
  const didRunInitialAttendanceLoadRef = useRef(false);
  const { t } = useLanguage();
  const todayDateValue = getLocalDateValue();
  const attendanceRangeStartValue = getAttendanceRangeStartValue();
  const isViewingToday = selectedAttendanceDate === todayDateValue;
  const isAttendanceDateOutOfRange = selectedAttendanceDate < attendanceRangeStartValue || selectedAttendanceDate > todayDateValue;
  const selectedAttendanceDateLabel = isViewingToday
    ? 'Today'
    : new Date(`${selectedAttendanceDate}T00:00:00`).toLocaleDateString();

  const applyTodayRecordsToGroups = (groups, todayRecords) => {
    const recordsByPlayerAndGroupId = new Map();

    todayRecords.forEach((record) => {
      recordsByPlayerAndGroupId.set(getAttendanceRecordKey(record.playerId, record.groupId), record);
    });

    return groups.map((group) => {
      const players = group.players.map((player) => ({
        ...player,
        todayAttendance: recordsByPlayerAndGroupId.get(getAttendanceRecordKey(player._id, group._id)) || null
      }));
      const markedCount = players.filter((player) => Boolean(player.todayAttendance)).length;
      const presentCount = players.filter((player) => player.todayAttendance?.status === 'present').length;

      return {
        ...group,
        players,
        markedCount,
        presentCount
      };
    });
  };

  const buildHistoricalGroups = (groups, playerSnapshots, snapshotDate) => {
    const groupsById = new Map();
    const fallbackGroupIds = [];
    const snapshotTime = new Date(`${snapshotDate}T23:59:59.999`).getTime();

    groups.forEach((group) => {
      groupsById.set(String(group._id), {
        ...group,
        players: [],
        currentCount: 0,
        markedCount: 0,
        presentCount: 0,
        color: group.color || '#2563eb'
      });
    });

    playerSnapshots
      .filter((player) => {
        const createdAtTime = player.createdAt ? new Date(player.createdAt).getTime() : null;
        return isPlayerVisibleInAttendance(player, snapshotDate) && (!createdAtTime || createdAtTime <= snapshotTime);
      })
      .forEach((player) => {
        const playerGroups = getSnapshotGroups(player);
        if (!playerGroups.length) {
          return;
        }

        const attendancePlayer = mapSnapshotPlayerToAttendancePlayer(player);
        playerGroups.forEach((snapshotGroup) => {
          const groupId = String(snapshotGroup._id);
          if (!groupsById.has(groupId)) {
            fallbackGroupIds.push(groupId);
            groupsById.set(groupId, {
              _id: groupId,
              name: snapshotGroup.name || 'Historical group',
              days: [],
              startTime: '',
              endTime: '',
              maxCapacity: '-',
              currentCount: 0,
              color: '#64748b',
              players: [],
              markedCount: 0,
              presentCount: 0
            });
          }

          const targetGroup = groupsById.get(groupId);
          targetGroup.players.push({
            ...attendancePlayer,
            groupId: { _id: groupId, name: targetGroup.name }
          });
          targetGroup.currentCount = targetGroup.players.length;
        });
      });

    return [
      ...groups.map((group) => groupsById.get(String(group._id))),
      ...fallbackGroupIds.map((groupId) => groupsById.get(groupId))
    ].filter(Boolean);
  };

  const loadAttendanceBoard = async (options = {}) => {
    const force = Boolean(options.force);
    const silent = Boolean(options.silent);
    const date = options.date || selectedAttendanceDate;
    const viewingToday = date === todayDateValue;
    const requestId = ++attendanceLoadRequestIdRef.current;
    const startedCacheVersion = getCacheVersion();

    const currentCacheVersion = startedCacheVersion;
    const hasCachedBoardForDate = attendanceBoardCache && attendanceBoardCacheDate === date && (Date.now() - attendanceBoardCacheTimestamp) < ATTENDANCE_BOARD_CACHE_TTL_MS;
    if (!force && attendanceBoardCache && attendanceBoardCacheDate === date && attendanceBoardCacheVersion === currentCacheVersion && (Date.now() - attendanceBoardCacheTimestamp) < ATTENDANCE_BOARD_CACHE_TTL_MS) {
      setGroupColumns(attendanceBoardCache);
      setIsLoading(false);
      return attendanceBoardCache;
    }

    if (!force && hasCachedBoardForDate) {
      setGroupColumns(attendanceBoardCache);
      setIsLoading(false);
    }

    try {
      if (!silent && !hasCachedBoardForDate) {
        setIsLoading(true);
      }
      const [groups, todayRecords] = await Promise.all([
        fetchGroups(),
        fetchTodayAttendance({ date })
      ]);
      const playerSnapshotResult = viewingToday
        ? null
        : await fetchHistorySnapshot({
          entityType: 'player',
          at: getHistorySnapshotIsoForDate(date)
        });
      const groupsWithPlayers = viewingToday
        ? await Promise.all(
          groups.map(async (group) => {
            const players = (await fetchGroupPlayers(group._id))
              .filter((player) => isPlayerVisibleInAttendance(player, date));

            return {
              ...group,
              players,
              color: group.color
            };
          })
        )
        : buildHistoricalGroups(groups, playerSnapshotResult?.rows || [], date);
      const groupsWithTodayAttendance = applyTodayRecordsToGroups(groupsWithPlayers, todayRecords);
      if (requestId !== attendanceLoadRequestIdRef.current || getCacheVersion() !== startedCacheVersion) {
        return groupColumnsRef.current;
      }

      attendanceBoardCache = groupsWithTodayAttendance;
      attendanceBoardCacheTimestamp = Date.now();
      attendanceBoardCacheDate = date;
      attendanceBoardCacheVersion = getCacheVersion();
      setGroupColumns(groupsWithTodayAttendance);
      setMessage(`${date === todayDateValue ? 'Today' : new Date(`${date}T00:00:00`).toLocaleDateString()} attendance loaded`);
      return groupsWithTodayAttendance;
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to load attendance board');
      return [];
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadAttendanceBoard({ date: selectedAttendanceDate });
  }, []);

  useEffect(() => {
    groupColumnsRef.current = groupColumns;
  }, [groupColumns]);

  useEffect(() => {
    if (isAttendanceDateOutOfRange) {
      setGroupColumns([]);
      setMessage('Out of range (maximum range is 3 months)');
      return;
    }

    if (!didRunInitialAttendanceLoadRef.current) {
      didRunInitialAttendanceLoadRef.current = true;
      return;
    }

    loadAttendanceBoard({ force: true, silent: true, date: selectedAttendanceDate });
  }, [selectedAttendanceDate]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
    const updateTouchDeviceState = () => {
      setIsCoarsePointerDevice(mediaQuery.matches);
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
    draggedGroupIdRef.current = groupId;
    dragOverGroupIdRef.current = groupId;
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
    autoScrollBoard(event.clientX);
    if (dragOverGroupId !== groupId) {
      dragOverGroupIdRef.current = groupId;
      setDragOverGroupId(groupId);
    }
  };

  const commitReorder = async (fromGroupId, targetGroupId) => {
    if (!fromGroupId || fromGroupId === targetGroupId) {
      return;
    }

    const previousGroups = groupColumns;
    const reorderedGroups = reorderGroups(groupColumns, fromGroupId, targetGroupId);
    setGroupColumns(reorderedGroups);
      attendanceBoardCache = reorderedGroups;
      attendanceBoardCacheTimestamp = Date.now();
      attendanceBoardCacheDate = selectedAttendanceDate;
      attendanceBoardCacheVersion = getCacheVersion();

    try {
      await reorderGroupsRequest(reorderedGroups.map((group) => group._id));
      setMessage('Group order updated');
    } catch (err) {
      setGroupColumns(previousGroups);
      attendanceBoardCache = previousGroups;
      attendanceBoardCacheTimestamp = Date.now();
      attendanceBoardCacheDate = selectedAttendanceDate;
      attendanceBoardCacheVersion = getCacheVersion();
      setMessage(err.response?.data?.message || 'Unable to update group order');
    }
  };

  const handleDrop = async (event, targetGroupId) => {
    event.preventDefault();
    const sourceGroupId = event.dataTransfer?.getData('text/plain') || draggedGroupIdRef.current || draggedGroupId;

    if (!sourceGroupId || sourceGroupId === targetGroupId) {
      draggedGroupIdRef.current = null;
      dragOverGroupIdRef.current = null;
      setDraggedGroupId(null);
      setDragOverGroupId(null);
      return;
    }

    draggedGroupIdRef.current = null;
    dragOverGroupIdRef.current = null;
    setDraggedGroupId(null);
    setDragOverGroupId(null);
    await commitReorder(sourceGroupId, targetGroupId);
  };

  const handleDragEnd = () => {
    draggedGroupIdRef.current = null;
    dragOverGroupIdRef.current = null;
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
    if (!isCoarsePointerDevice || draggedGroupId !== group._id || !touchDragPreview) {
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

  const setPlayerAttendanceInBoard = (playerId, targetGroupId, attendance) => {
    setGroupColumns((currentGroups) => {
      const currentPlayerRecords = currentGroups
        .flatMap((group) => group.players)
        .filter((player) => player._id === playerId);
      const targetPlayerRecord = currentGroups
        .find((group) => getEntityId(group._id) === getEntityId(targetGroupId))
        ?.players.find((player) => player._id === playerId) || null;
      const previousStatus = targetPlayerRecord?.todayAttendance?.status || null;
      const nextStatus = attendance?.status || null;
      const presentDelta = (previousStatus === 'present' ? -1 : 0) + (nextStatus === 'present' ? 1 : 0);
      const basePresentCount = Number((targetPlayerRecord || currentPlayerRecords[0])?.attendancePresentCount || 0);
      const nextPresentCount = Math.max(0, basePresentCount + presentDelta);

      const nextGroups = currentGroups.map((group) => {
        let changed = false;
        const nextPlayers = group.players.map((player) => {
          if (player._id !== playerId) {
            return player;
          }

          changed = true;
          const isTargetGroup = getEntityId(group._id) === getEntityId(targetGroupId);
          const nextAttendance = targetGroupId && isTargetGroup ? attendance : player.todayAttendance;
          const clearedAttendance = !attendance && (!targetGroupId || isTargetGroup) ? null : nextAttendance;
          const subscription = player.subscriptionId && typeof player.subscriptionId === 'object'
            ? {
              ...player.subscriptionId,
              usedSessions: Math.max(0, Number(player.subscriptionId.usedSessions || 0) + presentDelta),
              remainingSessions: typeof player.subscriptionId.remainingSessions !== 'undefined'
                ? Math.max(0, Number(player.subscriptionId.remainingSessions || 0) - presentDelta)
                : player.subscriptionId.remainingSessions
            }
            : player.subscriptionId;

          return {
            ...player,
            subscriptionId: subscription,
            attendancePresentCount: nextPresentCount,
            todayAttendance: clearedAttendance
          };
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
      });

      attendanceBoardCache = nextGroups;
      attendanceBoardCacheTimestamp = Date.now();
      attendanceBoardCacheDate = selectedAttendanceDate;
      attendanceBoardCacheVersion = getCacheVersion();
      return nextGroups;
    });
  };

  const setAttendanceActionPending = (key, isPending) => {
    const nextKeys = new Set(pendingAttendanceKeysRef.current);
    if (isPending) {
      nextKeys.add(key);
    } else {
      nextKeys.delete(key);
    }
    pendingAttendanceKeysRef.current = nextKeys;
    setPendingAttendanceKeys([...nextKeys]);
  };

  const getAttendanceActionKey = (playerId, groupId) => `${getEntityId(playerId)}:${getEntityId(groupId)}:${selectedAttendanceDate}`;

  const isAttendanceActionPending = (playerId, groupId) => pendingAttendanceKeys.includes(getAttendanceActionKey(playerId, groupId));

  const setAttendanceHistoryPending = (recordId) => {
    pendingAttendanceHistoryIdRef.current = recordId;
    setPendingAttendanceHistoryId(recordId);
  };

  const restoreBoard = (groups) => {
    setGroupColumns(groups);
    attendanceBoardCache = groups;
    attendanceBoardCacheTimestamp = Date.now();
    attendanceBoardCacheDate = selectedAttendanceDate;
    attendanceBoardCacheVersion = getCacheVersion();
  };

  const handleAction = async (player, groupId, status) => {
    if (isAttendanceDateOutOfRange) {
      setMessage('Out of range (maximum range is 3 months)');
      return;
    }

    const actionKey = getAttendanceActionKey(player._id, groupId);
    if (pendingAttendanceKeysRef.current.has(actionKey)) {
      return;
    }

    const previousGroups = groupColumns;
    const optimisticAttendance = {
      ...(player.todayAttendance || {}),
      playerId: player._id,
      groupId,
      status,
      date: new Date(`${selectedAttendanceDate}T00:00:00`).toISOString(),
      checkInTime: status === 'present' ? new Date().toISOString() : undefined
    };

    setMessage('');
    setAttendanceActionPending(actionKey, true);
    setPlayerAttendanceInBoard(player._id, groupId, optimisticAttendance);

    if (selectedPlayer?._id === player._id) {
      setSelectedPlayer((currentPlayer) => currentPlayer ? {
        ...currentPlayer,
        todayAttendance: optimisticAttendance
      } : currentPlayer);
    }

    try {
      const savedAttendance = await updateTodayAttendance({ playerId: player._id, groupId, status, date: selectedAttendanceDate });
      setPlayerAttendanceInBoard(player._id, groupId, savedAttendance);
      if (selectedPlayer?._id === player._id) {
        setSelectedPlayer((currentPlayer) => currentPlayer ? {
          ...currentPlayer,
          todayAttendance: savedAttendance
        } : currentPlayer);
      }
      setMessage('Attendance recorded');
    } catch (err) {
      restoreBoard(previousGroups);

      if (selectedPlayer?._id === player._id) {
        const previousSelectedPlayer = previousGroups
          .flatMap((group) => group.players)
          .find((currentPlayer) => currentPlayer._id === player._id && currentPlayer.todayAttendance);
        setSelectedPlayer((currentPlayer) => currentPlayer ? {
          ...currentPlayer,
          todayAttendance: previousSelectedPlayer?.todayAttendance || null
        } : currentPlayer);
      }

      setMessage(err.response?.data?.message || 'Unable to record attendance');
    } finally {
      setAttendanceActionPending(actionKey, false);
    }
  };

  const handleCancelAttendance = async (player, groupId) => {
    if (isAttendanceDateOutOfRange) {
      setMessage('Out of range (maximum range is 3 months)');
      return;
    }

    const actionKey = getAttendanceActionKey(player._id, groupId);
    if (pendingAttendanceKeysRef.current.has(actionKey)) {
      return;
    }

    const previousGroups = groupColumns;
    setMessage('');
    setAttendanceActionPending(actionKey, true);
    setPlayerAttendanceInBoard(player._id, groupId, null);

    if (selectedPlayer?._id === player._id) {
      setSelectedPlayer((currentPlayer) => currentPlayer ? {
        ...currentPlayer,
        todayAttendance: null
      } : currentPlayer);
    }

    try {
      const attendanceGroupId = getEntityId(player.todayAttendance?.groupId) || groupId;
      await cancelTodayAttendance({ playerId: player._id, groupId: attendanceGroupId, date: selectedAttendanceDate });
      setMessage('Attendance cancelled');
    } catch (err) {
      restoreBoard(previousGroups);

      if (selectedPlayer?._id === player._id) {
        const previousSelectedPlayer = previousGroups
          .flatMap((group) => group.players)
          .find((currentPlayer) => currentPlayer._id === player._id && currentPlayer.todayAttendance);
        setSelectedPlayer((currentPlayer) => currentPlayer ? {
          ...currentPlayer,
          todayAttendance: previousSelectedPlayer?.todayAttendance || null
        } : currentPlayer);
      }

      setMessage(err.response?.data?.message || 'Unable to cancel attendance');
    } finally {
      setAttendanceActionPending(actionKey, false);
    }
  };

  const handleSelectPlayer = async (player) => {
    try {
      setMessage('');
      setSelectedPlayer(player);
      setSelectedPlayerForm(createSelectedPlayerForm(player));
      setSelectedPlayerAttendanceHistory([]);
      setShowSelectedPlayerAttendanceHistory(false);
      setEditingAttendanceHistoryId(null);
      setIsEditingSelectedPlayer(false);

      const [latestPlayer, attendanceRecords] = await Promise.all([
        getPlayer(player._id),
        fetchAttendanceByPlayer(player._id)
      ]);

      setSelectedPlayer(latestPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(latestPlayer));
      setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to load student card');
    }
  };

  const createSelectedPlayerForm = (player) => ({
    fullName: player?.fullName || '',
    parentId: player?.parentId?._id || player?.parentId || '',
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

      const [parentsData, groupsData, packageData, latestPlayer] = await Promise.all([
        fetchParents(),
        fetchGroups(),
        fetchPackageOptions(),
        getPlayer(selectedPlayer._id)
      ]);

      setEditParents(parentsData);
      setEditGroups(groupsData);
      setPackageOptions(packageData);
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

  const openSubscriptionModal = () => {
    setSubscriptionForm({
      startDate: getDateInputValue(),
      endDate: getDateInputValue(selectedPlayer?.endDate)
    });
    setSubscriptionMessage('');
    setShowSubscriptionModal(true);
  };

  const handleSubscriptionSave = async (event, keepWarning = false) => {
    event.preventDefault();
    if (!selectedPlayer?._id) {
      return;
    }

    const confirmed = window.confirm('This will start a new subscription cycle and cannot be undone. Continue?');
    if (!confirmed) return;

    setSubscriptionMessage('');
    setIsSavingSubscription(true);
    try {
      await updatePlayer(selectedPlayer._id, {
        startDate: subscriptionForm.startDate,
        endDate: subscriptionForm.endDate,
        status: selectedPlayer.status === 'expired' ? 'active' : selectedPlayer.status,
        subscriptionNeedsAttention: keepWarning,
        newSubscription: true
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      setShowSubscriptionModal(false);
      setMessage('New subscription started');
      await loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
    } catch (error) {
      setSubscriptionMessage(error.response?.data?.message || 'Unable to start a new subscription.');
    } finally {
      setIsSavingSubscription(false);
    }
  };

  const handleClearSubscriptionAttention = async () => {
    if (!selectedPlayer?._id) {
      return;
    }

    try {
      setMessage('');
      await updatePlayer(selectedPlayer._id, { subscriptionNeedsAttention: false });
      const refreshedPlayer = await getPlayer(selectedPlayer._id);
      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setMessage('Subscription warning cleared');
      await loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to clear subscription warning');
    }
  };

  const handleSetSubscriptionAttention = async () => {
    if (!selectedPlayer?._id) {
      return;
    }

    try {
      setMessage('');
      await updatePlayer(selectedPlayer._id, { subscriptionNeedsAttention: true });
      const refreshedPlayer = await getPlayer(selectedPlayer._id);
      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setMessage('Subscription warning enabled');
      await loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark subscription warning');
    }
  };

  const handleAttendanceHistoryStatusChange = async (record, status) => {
    if (!selectedPlayer?._id || !record?._id || !['present', 'absent'].includes(status)) {
      return;
    }
    if (pendingAttendanceHistoryIdRef.current) {
      return;
    }

    const groupId = getEntityId(record.groupId) || getEntityId(selectedPlayer.groupId) || getEntityId(selectedPlayer.groupIds?.[0]);
    if (!groupId) {
      setMessage('Unable to edit attendance record without a group.');
      return;
    }

    try {
      setMessage('');
      setAttendanceHistoryPending(record._id);
      setSelectedPlayerAttendanceHistory((records) => records.map((item) => (
        item._id === record._id
          ? {
            ...item,
            status,
            checkInTime: status === 'present' ? (item.checkInTime || new Date().toISOString()) : undefined
          }
          : item
      )));
      await updateTodayAttendance({
        playerId: selectedPlayer._id,
        groupId,
        status,
        date: getDateInputValue(record.date)
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      setMessage('Attendance history updated');
      await loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
      setEditingAttendanceHistoryId(null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update attendance history');
    } finally {
      setAttendanceHistoryPending(null);
    }
  };

  const handleAttendanceHistoryCancel = async (record) => {
    if (!selectedPlayer?._id || !record?._id) {
      return;
    }
    if (pendingAttendanceHistoryIdRef.current) {
      return;
    }

    const groupId = getEntityId(record.groupId) || getEntityId(selectedPlayer.groupId) || getEntityId(selectedPlayer.groupIds?.[0]);
    const confirmed = window.confirm('Remove this attendance record?');
    if (!confirmed) {
      return;
    }

    try {
      setMessage('');
      setAttendanceHistoryPending(record._id);
      setSelectedPlayerAttendanceHistory((records) => records.filter((item) => item._id !== record._id));
      await cancelTodayAttendance({
        playerId: selectedPlayer._id,
        groupId,
        date: getDateInputValue(record.date)
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      setMessage('Attendance history record removed');
      await loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
      setEditingAttendanceHistoryId(null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to remove attendance history record');
    } finally {
      setAttendanceHistoryPending(null);
    }
  };

  const handleCountAttendanceInCurrentSubscription = async (record, options = {}) => {
    if (!selectedPlayer?._id || !record?._id) {
      return;
    }
    if (pendingAttendanceHistoryIdRef.current) {
      return;
    }

    const countAsPresent = Boolean(options.countAsPresent);
    const confirmed = window.confirm(countAsPresent
      ? 'Mark this record present and count it as part of the current subscription?'
      : 'Count this attendance record as part of the current subscription?');
    if (!confirmed) {
      return;
    }

    const recordDateValue = getDateInputValue(record.date);
    const groupId = getEntityId(record.groupId) || getEntityId(selectedPlayer.groupId) || getEntityId(selectedPlayer.groupIds?.[0]);
    if (countAsPresent && !groupId) {
      setMessage('Unable to count attendance record without a group.');
      return;
    }

    try {
      setMessage('');
      setAttendanceHistoryPending(record._id);
      const nextSubscriptionStart = recordDateValue;
      setSelectedPlayer((currentPlayer) => currentPlayer ? {
        ...currentPlayer,
        currentSubscriptionStartedAt: nextSubscriptionStart
      } : currentPlayer);
      if (countAsPresent && record.status !== 'present') {
        setSelectedPlayerAttendanceHistory((records) => records.map((item) => (
          item._id === record._id
            ? {
              ...item,
              status: 'present',
              checkInTime: item.checkInTime || new Date().toISOString()
            }
            : item
        )));
        await updateTodayAttendance({
          playerId: selectedPlayer._id,
          groupId,
          status: 'present',
          date: recordDateValue
        });
      }
      await updatePlayer(selectedPlayer._id, {
        currentSubscriptionStartedAt: nextSubscriptionStart
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      setMessage(countAsPresent
        ? 'Attendance record marked present and counted in current subscription'
        : 'Attendance record counted in current subscription');
      await loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
      setEditingAttendanceHistoryId(null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to count this attendance in current subscription');
    } finally {
      setAttendanceHistoryPending(null);
    }
  };

  const handleRemoveAttendanceFromCurrentSubscription = async (record) => {
    if (!selectedPlayer?._id || !record?._id) {
      return;
    }
    if (pendingAttendanceHistoryIdRef.current) {
      return;
    }

    const confirmed = window.confirm('Remove this attendance record from the current subscription counter?');
    if (!confirmed) {
      return;
    }

    const recordDate = new Date(record.checkInTime || record.date);
    recordDate.setDate(recordDate.getDate() + 1);

    try {
      setMessage('');
      setAttendanceHistoryPending(record._id);
      const nextSubscriptionStart = getDateInputValue(recordDate);
      setSelectedPlayer((currentPlayer) => currentPlayer ? {
        ...currentPlayer,
        currentSubscriptionStartedAt: nextSubscriptionStart
      } : currentPlayer);
      await updatePlayer(selectedPlayer._id, {
        currentSubscriptionStartedAt: nextSubscriptionStart
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      setMessage('Attendance record removed from current subscription');
      await loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
      setEditingAttendanceHistoryId(null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to remove this attendance from current subscription');
    } finally {
      setAttendanceHistoryPending(null);
    }
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

      const refreshedPlayer = await getPlayer(selectedPlayer._id);

      setSelectedPlayer(refreshedPlayer);
      setSelectedPlayerForm(createSelectedPlayerForm(refreshedPlayer));
      setIsEditingSelectedPlayer(false);
      setMessage('Player updated successfully');
      await loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to update player');
    }
  };

  const formatGroupTime = (group) => [group.startTime, group.endTime].filter(Boolean).join(' - ');
  const formatDate = (date) => date ? new Date(date).toLocaleDateString() : t('notSet');
  const getRecentAttendanceRecords = (records) => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return records.filter((record) => new Date(record.date) >= threeMonthsAgo);
  };
  const isCurrentSubscriptionAttendanceRecord = (record) => {
    const preciseCycleStart = selectedPlayer?.currentSubscriptionStartedAt;
    const cycleStart = preciseCycleStart
      || selectedPlayer?.subscriptionId?.startDate
      || selectedPlayer?.startDate;

    if (!cycleStart) {
      return true;
    }

    if (preciseCycleStart) {
      const recordTime = record.checkInTime || getObjectIdDate(record._id) || record.date;
      return new Date(recordTime) >= new Date(preciseCycleStart);
    }

    return getLocalDateOnly(record.date) >= getLocalDateOnly(cycleStart);
  };
  const getPlayerGroups = (player) => {
    const groups = player?.groupIds?.length ? player.groupIds : [player?.groupId].filter(Boolean);
    return groups.map((group) => group?.name).filter(Boolean).join(', ');
  };
  const selectedPlayerParentOptions = selectedPlayer?.parentId && typeof selectedPlayer.parentId === 'object' && !editParents.some((parent) => parent._id === selectedPlayer.parentId._id)
    ? [{ ...selectedPlayer.parentId, phone: selectedPlayer.parentPhone || selectedPlayer.parentId.phone || '' }, ...editParents]
    : editParents;
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
          <div className="attendance-date-picker">
            <span>{selectedAttendanceDateLabel}</span>
            <button
              type="button"
              aria-label="Choose attendance date"
              onClick={() => {
                const input = attendanceDateInputRef.current;
                if (!input) return;
                if (typeof input.showPicker === 'function') {
                  input.showPicker();
                } else {
                  input.click();
                }
              }}
            />
            <input
              ref={attendanceDateInputRef}
              type="date"
              min={attendanceRangeStartValue}
              max={todayDateValue}
              value={selectedAttendanceDate}
              onChange={(event) => setSelectedAttendanceDate(event.target.value || todayDateValue)}
              aria-label="Attendance date"
            />
          </div>
          <label className="table-search attendance-search">
            <span>Search</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students or groups..." />
          </label>
          <button type="button" className="btn-secondary" onClick={() => loadAttendanceBoard({ force: true, date: selectedAttendanceDate })}>{t('refresh')}</button>
        </div>

        {isAttendanceDateOutOfRange && (
          <div className="attendance-range-warning">
            Out of range <span>(maximum range is 3 months)</span>
          </div>
        )}

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
                onDragOver={(event) => handleDragOver(event, group._id)}
                onDrop={(event) => handleDrop(event, group._id)}
              >
                <div
                  className="attendance-group-header"
                  draggable
                  onDragStart={(event) => handleDragStart(event, group._id)}
                  onDragEnd={handleDragEnd}
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
                  {group.players.length ? group.players.map((player) => {
                    const isFrozen = isPlayerFrozen(player);
                    const isExpired = isPlayerSubscriptionExpired(player);
                    const packageCounter = getPlayerPackageCounter(player);
                    return (
                      <article className={`attendance-player-card${isFrozen ? ' is-frozen' : ''}${isExpired ? ' is-expired' : ''}`} key={player._id}>
                        <button type="button" className="attendance-player-main" onClick={() => handleSelectPlayer(player)}>
                          <strong>{player.fullName}</strong>
                          <span>{player.parentId?.name || t('noParent')} | {player.status}</span>
                          <em className="attendance-package-counter">
                            {packageCounter.total > 0 ? `${packageCounter.used}/${packageCounter.total}` : packageCounter.used}
                          </em>
                          {isExpired && (
                            <em className="attendance-expired-badge">{player.subscriptionNeedsAttention ? 'Review' : 'Expired'}</em>
                          )}
                          {isFrozen && (
                            <em className="attendance-frozen-badge">❄ {t('frozenStatus')}</em>
                          )}
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
                            disabled={isAttendanceActionPending(player._id, group._id)}
                          >
                            {t('present')}
                          </button>
                          <button
                            type="button"
                            className={`btn-absent ${player.todayAttendance?.status === 'absent' ? 'active' : ''}`}
                            onClick={() => handleAction(player, group._id, 'absent')}
                            disabled={isAttendanceActionPending(player._id, group._id)}
                          >
                            {t('absent')}
                          </button>
                          {player.todayAttendance && (
                            <button
                              type="button"
                              className="btn-cancel-attendance"
                              onClick={() => handleCancelAttendance(player, group._id)}
                              disabled={isAttendanceActionPending(player._id, group._id)}
                            >
                              {isAttendanceActionPending(player._id, group._id) ? 'Saving...' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  }) : <p className="empty-state">{t('noStudentsInGroup')}</p>}
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
                    <>
                      <button type="button" className="new-subscription-button compact" onClick={openSubscriptionModal}>
                        <span>New Subscription</span>
                      </button>
                      <button type="button" className="btn-primary" onClick={handleStartEditSelectedPlayer}>{t('edit')}</button>
                    </>
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
                        {selectedPlayerParentOptions.map((parent) => (
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
                        <option value="tryout">{t('tryoutStatus')}</option>
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
                <>
                  <div className="student-info-grid">
                    <div><span>{t('name')}</span><strong>{selectedPlayer.fullName || t('notSet')}</strong></div>
                    <div><span>{t('parent')}</span><strong>{selectedPlayer.parentId?.name || t('notSet')}</strong></div>
                    <div><span>{t('parentPhone')}</span><strong>{selectedPlayer.parentPhone || t('notSet')}</strong></div>
                    <div><span>{t('status')}</span><strong>{selectedPlayer.status || t('notSet')}</strong></div>
                    <div><span>{t('startDate')}</span><strong>{formatDate(selectedPlayer.startDate)}</strong></div>
                    <div><span>{t('endDate')}</span><strong>{formatDate(selectedPlayer.endDate)}</strong></div>
                    <div><span>{t('package')}</span><strong>{selectedPlayer.packageName ? (selectedPlayer.packageName === 'custom' ? t('customPackage') : selectedPlayer.packageName) : t('notSet')}</strong></div>
                    <div><span>{t('payment')}</span><strong>{selectedPlayer.payment ?? 0}</strong></div>
                    <div><span>{t('classes')}</span><strong>{selectedPlayer.packageClasses ?? 0}</strong></div>
                    <div><span>{t('hours')}</span><strong>{selectedPlayer.packageHours ?? 0}</strong></div>
                    <div className={`student-info-grid-full subscription-attention-box${selectedPlayer.subscriptionNeedsAttention ? ' is-active' : ''}`}>
                      <span>Subscription highlight</span>
                      <strong>
                        {selectedPlayer.subscriptionNeedsAttention
                          ? 'This player is intentionally highlighted.'
                          : 'Mark this player red for admin review.'}
                      </strong>
                      {selectedPlayer.subscriptionNeedsAttention ? (
                        <button type="button" className="btn-secondary" onClick={handleClearSubscriptionAttention}>Clear red highlight</button>
                      ) : (
                        <button type="button" className="btn-secondary" onClick={handleSetSubscriptionAttention}>Set highlight</button>
                      )}
                    </div>
                    {selectedPlayer.note && (
                      <div className="student-info-grid-full"><span>{t('note')}</span><strong>{selectedPlayer.note}</strong></div>
                    )}
                  </div>
                  <div className="student-modal-history-panel">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowSelectedPlayerAttendanceHistory((current) => !current)}
                    >
                      Attendance History
                    </button>
                    {showSelectedPlayerAttendanceHistory && (
                      <div className="student-history-list">
                        {selectedPlayerAttendanceHistory.length ? selectedPlayerAttendanceHistory.map((record) => (
                          <div className={`student-history-row${isCurrentSubscriptionAttendanceRecord(record) ? ' is-current-subscription' : ''} attendance-history-${record.status}`} key={record._id}>
                            <span>{new Date(record.date).toLocaleDateString()}</span>
                            <strong>{record.status}</strong>
                            <span>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}</span>
                            <div className="student-history-actions">
                              {editingAttendanceHistoryId === record._id ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn-present compact"
                                    onClick={() => handleAttendanceHistoryStatusChange(record, 'present')}
                                    disabled={pendingAttendanceHistoryId === record._id}
                                  >
                                    {pendingAttendanceHistoryId === record._id ? 'Saving...' : 'Present'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-absent compact"
                                    onClick={() => handleAttendanceHistoryStatusChange(record, 'absent')}
                                    disabled={pendingAttendanceHistoryId === record._id}
                                  >
                                    Absent
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary compact"
                                    onClick={() => handleAttendanceHistoryCancel(record)}
                                    disabled={pendingAttendanceHistoryId === record._id}
                                  >
                                    Remove
                                  </button>
                                  {record.status === 'present' && !isCurrentSubscriptionAttendanceRecord(record) && (
                                    <button
                                      type="button"
                                      className="btn-secondary compact"
                                      onClick={() => handleCountAttendanceInCurrentSubscription(record)}
                                      disabled={pendingAttendanceHistoryId === record._id}
                                    >
                                      Count in current sub
                                    </button>
                                  )}
                                  {record.status === 'absent' && !isCurrentSubscriptionAttendanceRecord(record) && (
                                    <button
                                      type="button"
                                      className="btn-secondary compact"
                                      onClick={() => handleCountAttendanceInCurrentSubscription(record, { countAsPresent: true })}
                                      disabled={pendingAttendanceHistoryId === record._id}
                                    >
                                      Present + current sub
                                    </button>
                                  )}
                                  {record.status === 'present' && isCurrentSubscriptionAttendanceRecord(record) && (
                                    <button
                                      type="button"
                                      className="btn-secondary compact"
                                      onClick={() => handleRemoveAttendanceFromCurrentSubscription(record)}
                                      disabled={pendingAttendanceHistoryId === record._id}
                                    >
                                      Remove from current sub
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn-secondary compact"
                                    onClick={() => setEditingAttendanceHistoryId(null)}
                                    disabled={pendingAttendanceHistoryId === record._id}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-secondary compact"
                                  onClick={() => setEditingAttendanceHistoryId(record._id)}
                                  disabled={Boolean(pendingAttendanceHistoryId)}
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </div>
                        )) : <p className="empty-state">No attendance history found for the last 3 months.</p>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {showSubscriptionModal && selectedPlayer && (
          <div className="student-modal-backdrop" role="presentation" onClick={() => setShowSubscriptionModal(false)}>
            <div className="student-modal new-subscription-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div>
                  <h2>New Subscription</h2>
                  <p>{selectedPlayer.fullName} - choose the new subscription dates.</p>
                </div>
                <button className="btn-secondary" type="button" onClick={() => setShowSubscriptionModal(false)}>Close</button>
              </div>
              <p className="new-subscription-warning">Warning: this starts a fresh subscription counter for this player.</p>
              {subscriptionMessage && <p className="alert-error">{subscriptionMessage}</p>}
              <form className="student-modal-edit-form" onSubmit={(event) => handleSubscriptionSave(event, false)}>
                <div className="student-modal-edit-grid">
                  <label>
                    <span>{t('startDate')}</span>
                    <input
                      type="date"
                      value={subscriptionForm.startDate}
                      onChange={(event) => setSubscriptionForm({ ...subscriptionForm, startDate: event.target.value })}
                      required
                    />
                  </label>
                  <label>
                    <span>{t('endDate')}</span>
                    <input
                      type="date"
                      value={subscriptionForm.endDate}
                      onChange={(event) => setSubscriptionForm({ ...subscriptionForm, endDate: event.target.value })}
                      required
                    />
                  </label>
                </div>
                <div className="student-modal-edit-actions">
                  <button className="btn-primary" type="submit" disabled={isSavingSubscription}>
                    {isSavingSubscription ? 'Saving...' : 'Start normally'}
                  </button>
                  <button
                    className="new-subscription-button compact"
                    type="button"
                    disabled={isSavingSubscription}
                    onClick={(event) => handleSubscriptionSave(event, true)}
                  >
                    <span>{isSavingSubscription ? 'Saving...' : 'Start and keep warning'}</span>
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setShowSubscriptionModal(false)}>Cancel</button>
                </div>
              </form>
            </div>
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
