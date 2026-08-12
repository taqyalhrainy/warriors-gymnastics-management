import { useEffect, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { updateTodayAttendance, cancelTodayAttendance, fetchAttendanceByPlayer, fetchTodayAttendance } from '../services/attendance.js';
import { fetchGroups, fetchGroupPlayers, reorderGroups as reorderGroupsRequest } from '../services/groups.js';
import { fetchHistorySnapshot, fetchPlayerHistory } from '../services/history.js';
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

const getEarliestDateValue = (...dates) => dates
  .map((date) => getDateInputValue(date))
  .filter(Boolean)
  .sort((first, second) => new Date(first) - new Date(second))[0] || '';

const getFourWeekEndDateValue = (startDate) => {
  const [year, month, day] = String(startDate || getDateInputValue()).split('-').map(Number);
  const value = new Date(year, month - 1, day);
  if (Number.isNaN(value.getTime())) return '';
  value.setDate(value.getDate() + 28);
  return getDateInputValue(value);
};

const DAY_INDEXES = {
  sunday: 0, sun: 0, 'الأحد': 0,
  monday: 1, mon: 1, 'الاثنين': 1, 'الإثنين': 1,
  tuesday: 2, tue: 2, tues: 2, 'الثلاثاء': 2,
  wednesday: 3, wed: 3, 'الأربعاء': 3,
  thursday: 4, thu: 4, thurs: 4, 'الخميس': 4,
  friday: 5, fri: 5, 'الجمعة': 5,
  saturday: 6, sat: 6, 'السبت': 6
};

const getDayIndexFromText = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (Number.isInteger(DAY_INDEXES[normalized])) return DAY_INDEXES[normalized];
  const match = Object.entries(DAY_INDEXES).find(([dayName]) => normalized.includes(dayName));
  return match ? match[1] : null;
};

const getGroupScheduledDayIndexes = (group) => {
  const daySources = Array.isArray(group?.days) ? group.days : [group?.days].filter(Boolean);
  if (group?.name) daySources.push(group.name);
  return daySources
    .flatMap((value) => String(value || '').split(/[\/,|]+/))
    .map(getDayIndexFromText)
    .filter((day) => Number.isInteger(day));
};

const getScheduledEndDateValue = (startDate, player, availableGroups = [], options = {}) => {
  const totalClasses = Number(options.totalClasses || player?.packageClasses || player?.subscriptionId?.totalSessions || 0);
  const playerGroups = player?.groupIds?.length ? player.groupIds : [player?.groupId].filter(Boolean);
  const groups = playerGroups.map((group) => {
    if (group?.days) return group;
    const groupId = getEntityId(group);
    return availableGroups.find((availableGroup) => getEntityId(availableGroup._id) === groupId) || group;
  });
  const scheduledDays = new Set(
    options.dayIndexes?.length
      ? options.dayIndexes
      : groups
        .flatMap(getGroupScheduledDayIndexes)
        .filter((day) => Number.isInteger(day))
  );

  if (!startDate || totalClasses <= 0 || !scheduledDays.size) {
    return getFourWeekEndDateValue(startDate);
  }

  const [year, month, day] = String(startDate).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';

  let scheduledClasses = 0;
  while (scheduledClasses < totalClasses) {
    if (scheduledDays.has(date.getDay())) scheduledClasses += 1;
    if (scheduledClasses < totalClasses) date.setDate(date.getDate() + 1);
  }

  return getDateInputValue(date);
};

const getLocalDateOnly = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const getLocalDateEnd = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
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
const getPlayerAttendanceGroupId = (player) => (
  getEntityId(player?.attendanceGroupId)
  || getEntityId(player?.groupId)
  || getEntityId(player?.groupIds?.[0])
);
const dedupePlayersById = (players = []) => {
  const seenPlayerIds = new Set();
  return players.filter((player) => {
    const playerId = getEntityId(player._id);
    if (!playerId || seenPlayerIds.has(playerId)) {
      return false;
    }
    seenPlayerIds.add(playerId);
    return true;
  });
};

const decodeDisplayText = (value) => {
  if (typeof value !== 'string') {
    return value || '';
  }

  if (typeof document === 'undefined') {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&#x2F;/g, '/')
      .replace(/&#47;/g, '/');
  }

  const textarea = document.createElement('textarea');
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    textarea.innerHTML = decoded;
    if (textarea.value === decoded) break;
    decoded = textarea.value;
  }
  return decoded;
};

const isPlayerVisibleInAttendance = (player) => (
  !player?.isDeleted
  && player?.status !== 'left'
  && !(player?.status === 'frozen' && player?.showInAttendanceWhenFrozen === false)
);
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

const formatCompactMoney = (value) => Number(value || 0).toLocaleString('en-US');
const isSubscriptionPaymentType = (value) => ['full payment', 'partial payment'].includes(String(value || '').trim().toLowerCase());

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
    previousDueBalance: Number(player.previousDueBalance || 0),
    dueAdjustment: Number(player.dueAdjustment || 0),
    note: decodeDisplayText(player.note),
    freezeNote: decodeDisplayText(player.freezeNote),
    status: player.status || '',
    profileImage: player.profileImage || '',
    createdAt: player.createdAt || null
  };
};

const AttendancePage = () => {
  const [groupColumns, setGroupColumns] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedPlayerAttendanceHistory, setSelectedPlayerAttendanceHistory] = useState([]);
  const [selectedPlayerSubscriptionHistory, setSelectedPlayerSubscriptionHistory] = useState([]);
  const [openSubscriptionHistoryKey, setOpenSubscriptionHistoryKey] = useState('');
  const [showSelectedPlayerAttendanceHistory, setShowSelectedPlayerAttendanceHistory] = useState(false);
  const [showFreezeNoteDetails, setShowFreezeNoteDetails] = useState(false);
  const [editingAttendanceHistoryId, setEditingAttendanceHistoryId] = useState(null);
  const [pendingAttendanceHistoryId, setPendingAttendanceHistoryId] = useState(null);
  const [dueAdjustmentForm, setDueAdjustmentForm] = useState('');
  const [isSavingDueAdjustment, setIsSavingDueAdjustment] = useState(false);
  const [isEditingSelectedPlayer, setIsEditingSelectedPlayer] = useState(false);
  const [selectedPlayerForm, setSelectedPlayerForm] = useState(null);
  const [showUnsavedExitConfirm, setShowUnsavedExitConfirm] = useState(false);
  const [pendingFrozenVisibilitySave, setPendingFrozenVisibilitySave] = useState(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState({
    startDate: '',
    endDate: '',
    scheduleMode: 'auto',
    customDays: [],
    customClasses: ''
  });
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const [isSavingSubscription, setIsSavingSubscription] = useState(false);
  const [pendingSelectedPlayerMutation, setPendingSelectedPlayerMutation] = useState('');
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
  const attendanceActionSequenceRef = useRef(0);
  const latestAttendanceActionRef = useRef(new Map());
  const localAttendanceOverridesRef = useRef(new Map());
  const subscriptionSaveSequenceRef = useRef(0);
  const pendingAttendanceHistoryIdRef = useRef(null);
  const didRunInitialAttendanceLoadRef = useRef(false);
  const selectedPlayerRef = useRef(null);
  const selectedPlayerFormDirtyRef = useRef(false);
  const selectedPlayerLoadRequestIdRef = useRef(0);
  const selectedPlayerEditRequestIdRef = useRef(0);
  const selectedPlayerMutationSequenceRef = useRef(0);
  const pendingSelectedPlayerMutationRef = useRef('');
  const { t } = useLanguage();
  const todayDateValue = getLocalDateValue();
  const attendanceRangeStartValue = getAttendanceRangeStartValue();
  const isViewingToday = selectedAttendanceDate === todayDateValue;
  const isAttendanceDateOutOfRange = selectedAttendanceDate < attendanceRangeStartValue || selectedAttendanceDate > todayDateValue;

  const getLocalAttendanceOverrideKey = (date, playerId, groupId) => `${date}:${getEntityId(playerId)}:${getEntityId(groupId)}`;

  const applyLocalAttendanceOverrides = (records, date) => {
    const recordsByKey = new Map((records || []).map((record) => [
      getLocalAttendanceOverrideKey(date, record.playerId, record.groupId),
      record
    ]));
    localAttendanceOverridesRef.current.forEach((record, key) => {
      if (key.startsWith(`${date}:`)) {
        recordsByKey.set(key, record);
      }
    });
    return [...recordsByKey.values()];
  };

  const applyLocalPlayerAttendanceOverrides = (records, playerId) => {
    const recordsById = new Map((records || []).map((record) => [
      getEntityId(record._id) || getLocalAttendanceOverrideKey(getDateInputValue(record.date), record.playerId, record.groupId),
      record
    ]));
    localAttendanceOverridesRef.current.forEach((record) => {
      if (getEntityId(record.playerId) === getEntityId(playerId)) {
        recordsById.set(getEntityId(record._id) || getLocalAttendanceOverrideKey(getDateInputValue(record.date), record.playerId, record.groupId), record);
      }
    });
    return [...recordsById.values()];
  };
  const selectedAttendanceDateLabel = isViewingToday
    ? 'Today'
    : new Date(`${selectedAttendanceDate}T00:00:00`).toLocaleDateString();

  const applyTodayRecordsToGroups = (groups, todayRecords) => {
    const recordsByPlayerAndGroupId = new Map();

    todayRecords.forEach((record) => {
      recordsByPlayerAndGroupId.set(getAttendanceRecordKey(record.playerId, record.groupId), record);
    });

    return groups.map((group) => {
      const players = dedupePlayersById(group.players).map((player) => ({
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

  const buildHistoricalGroups = (groups, playerSnapshots, snapshotDate, currentGroupsWithPlayers = []) => {
    const groupsById = new Map();
    const fallbackGroupIds = [];
    const historicalPlayerIds = new Set();
    const currentPlayerById = new Map();

    currentGroupsWithPlayers.forEach((group) => {
      group.players.forEach((player) => {
        if (!currentPlayerById.has(getEntityId(player._id))) {
          currentPlayerById.set(getEntityId(player._id), player);
        }
      });
    });

    const mergeCurrentPackageCounter = (player, groupId) => {
      const currentPlayer = currentPlayerById.get(getEntityId(player._id));
      if (!currentPlayer) {
        return {
          ...player,
          attendanceGroupId: groupId
        };
      }

      return {
        ...player,
        fullName: currentPlayer.fullName || player.fullName,
        parentId: currentPlayer.parentId || player.parentId,
        parentPhone: currentPlayer.parentPhone || player.parentPhone,
        note: currentPlayer.note ?? player.note,
        freezeNote: currentPlayer.freezeNote ?? player.freezeNote,
        profileImage: currentPlayer.profileImage || player.profileImage,
        attendanceGroupId: groupId,
        attendancePresentCount: currentPlayer.attendancePresentCount ?? player.attendancePresentCount,
        subscriptionId: currentPlayer.subscriptionId || player.subscriptionId
      };
    };

    const ensureHistoricalGroup = (groupId, groupName = 'Historical group') => {
      if (!groupsById.has(groupId)) {
        fallbackGroupIds.push(groupId);
        groupsById.set(groupId, {
          _id: groupId,
          name: groupName,
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

      return groupsById.get(groupId);
    };

    const addPlayerToGroup = (groupId, groupName, player) => {
      const targetGroup = ensureHistoricalGroup(groupId, groupName);
      const playerId = getEntityId(player);
      if (targetGroup.players.some((groupPlayer) => getEntityId(groupPlayer) === playerId)) {
        return;
      }

      targetGroup.players.push({
        ...mergeCurrentPackageCounter(player, groupId),
        groupId: { _id: groupId, name: targetGroup.name }
      });
      targetGroup.currentCount = targetGroup.players.length;
    };

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
      .filter((player) => isPlayerVisibleInAttendance(player, snapshotDate))
      .forEach((player) => {
        const playerGroups = getSnapshotGroups(player);
        if (!playerGroups.length) {
          return;
        }

        const attendancePlayer = mapSnapshotPlayerToAttendancePlayer(player);
        historicalPlayerIds.add(getEntityId(attendancePlayer));
        playerGroups.forEach((snapshotGroup) => {
          const groupId = String(snapshotGroup._id);
          addPlayerToGroup(groupId, snapshotGroup.name || 'Historical group', attendancePlayer);
        });
      });

    currentGroupsWithPlayers.forEach((group) => {
      group.players
        .filter((player) => {
          return !historicalPlayerIds.has(getEntityId(player))
            && isPlayerVisibleInAttendance(player, snapshotDate);
        })
        .forEach((player) => {
          addPlayerToGroup(String(group._id), group.name || 'Historical group', player);
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
    const hasCachedBoardForDate = attendanceBoardCache && attendanceBoardCacheDate === date && attendanceBoardCacheVersion === currentCacheVersion && (Date.now() - attendanceBoardCacheTimestamp) < ATTENDANCE_BOARD_CACHE_TTL_MS;
    if (!force && hasCachedBoardForDate) {
      groupColumnsRef.current = attendanceBoardCache;
      setGroupColumns(attendanceBoardCache);
      setIsLoading(false);
      return attendanceBoardCache;
    }

    try {
      if (!silent && !hasCachedBoardForDate) {
        setIsLoading(true);
      }
      const [groups, todayRecords] = await Promise.all([
        fetchGroups({ force }),
        fetchTodayAttendance({ date }, { force })
      ]);
      const playerSnapshotResult = viewingToday
        ? null
        : await fetchHistorySnapshot({
          entityType: 'player',
          at: getHistorySnapshotIsoForDate(date)
        });
      const currentGroupsWithPlayers = await Promise.all(
        groups.map(async (group) => {
          const players = dedupePlayersById(await fetchGroupPlayers(group._id, { force }))
            .filter((player) => isPlayerVisibleInAttendance(player, date));

          return {
            ...group,
            players,
            color: group.color
          };
        })
      );
      const groupsWithPlayers = viewingToday
        ? currentGroupsWithPlayers
        : buildHistoricalGroups(groups, playerSnapshotResult?.rows || [], date, currentGroupsWithPlayers);
      const groupsWithTodayAttendance = applyTodayRecordsToGroups(groupsWithPlayers, applyLocalAttendanceOverrides(todayRecords, date));
      if (requestId !== attendanceLoadRequestIdRef.current || getCacheVersion() !== startedCacheVersion) {
        return groupColumnsRef.current;
      }

      attendanceBoardCache = groupsWithTodayAttendance;
      attendanceBoardCacheTimestamp = Date.now();
      attendanceBoardCacheDate = date;
      attendanceBoardCacheVersion = getCacheVersion();
      groupColumnsRef.current = groupsWithTodayAttendance;
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
    selectedPlayerRef.current = selectedPlayer;
  }, [selectedPlayer]);

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

    loadAttendanceBoard({ force: true, date: selectedAttendanceDate });
  }, [selectedAttendanceDate]);

  useEffect(() => {
    const handlePaymentsChanged = (event) => {
      const payment = event.detail || {};
      const paymentType = payment.transactionType || payment.requestedPayment?.transactionType;
      if (payment.action !== 'create' || !isSubscriptionPaymentType(paymentType)) return;
      const playerId = payment.playerId?._id || payment.playerId || payment.requestedPayment?.playerId;
      patchPlayerPaymentDueInAttendanceBoard(playerId, Number(payment.paidAmount || payment.requestedPayment?.paidAmount || 0));
    };
    window.addEventListener('payments:changed', handlePaymentsChanged);
    return () => window.removeEventListener('payments:changed', handlePaymentsChanged);
  }, []);

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
        const nextPlayers = dedupePlayersById(group.players).map((player) => {
          if (player._id !== playerId) {
            return player;
          }

          changed = true;
          const isTargetGroup = getEntityId(group._id) === getEntityId(targetGroupId);
          const nextAttendance = targetGroupId && isTargetGroup ? attendance : player.todayAttendance;
          const clearedAttendance = !attendance && (!targetGroupId || isTargetGroup) ? null : nextAttendance;
          const nextPlayerPresentCount = nextPresentCount;
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
            attendancePresentCount: nextPlayerPresentCount,
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
      groupColumnsRef.current = nextGroups;
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

  const getAttendancePlayerFromBoard = (groups, playerId, groupId) => groups
    .find((group) => getEntityId(group._id) === getEntityId(groupId))
    ?.players.find((currentPlayer) => getEntityId(currentPlayer._id) === getEntityId(playerId)) || null;

  const patchPlayerInAttendanceBoard = (updatedPlayer, attendanceRecords = null, fallbackGroupId = '') => {
    if (!updatedPlayer?._id) {
      return;
    }

    setGroupColumns((currentGroups) => {
      const playerId = getEntityId(updatedPlayer._id);
      const attendanceByGroupId = new Map();
      const existingPlayerByGroupId = new Map();
      const targetGroups = getSnapshotGroups(updatedPlayer);
      const targetGroupIds = new Set(targetGroups.map((group) => getEntityId(group._id)).filter(Boolean));
      const isVisibleForSelectedDate = isPlayerVisibleInAttendance(updatedPlayer);
      const hasAttendanceOverride = Array.isArray(attendanceRecords);
      const selectedDateRecords = hasAttendanceOverride
        ? attendanceRecords.filter((record) => getDateInputValue(record.date) === selectedAttendanceDate)
        : [];
      const overrideAttendanceByGroupId = new Map();
      selectedDateRecords.forEach((record) => {
        overrideAttendanceByGroupId.set(getEntityId(record.groupId), record);
      });
      if (hasAttendanceOverride && fallbackGroupId && !overrideAttendanceByGroupId.has(getEntityId(fallbackGroupId))) {
        overrideAttendanceByGroupId.set(getEntityId(fallbackGroupId), null);
      }

      currentGroups.forEach((group) => {
        const groupId = getEntityId(group._id);
        const existingPlayer = group.players.find((player) => getEntityId(player._id) === playerId);
        if (existingPlayer) {
          existingPlayerByGroupId.set(groupId, existingPlayer);
          if (existingPlayer.todayAttendance) {
            attendanceByGroupId.set(groupId, existingPlayer.todayAttendance);
          }
        }
      });
      const existingPlayerAnyGroup = Array.from(existingPlayerByGroupId.values())[0] || null;

      const nextGroups = currentGroups.map((group) => {
        const groupId = getEntityId(group._id);
        const shouldIncludePlayer = isVisibleForSelectedDate && targetGroupIds.has(groupId);
        const groupInfo = targetGroups.find((targetGroup) => getEntityId(targetGroup._id) === groupId);
        const cleanPlayers = dedupePlayersById(group.players);
        const existingPlayerIndex = cleanPlayers.findIndex((player) => getEntityId(player._id) === playerId);
        const existingPlayer = existingPlayerByGroupId.get(groupId);
        let nextPlayers = cleanPlayers.filter((player) => getEntityId(player._id) !== playerId);

        if (shouldIncludePlayer) {
          const patchedPlayer = {
            ...existingPlayer,
            ...updatedPlayer,
            attendanceGroupId: groupId,
            attendancePresentCount: updatedPlayer.attendancePresentCount
              ?? existingPlayer?.attendancePresentCount
              ?? existingPlayerAnyGroup?.attendancePresentCount,
            groupId: groupInfo ? { ...groupInfo } : updatedPlayer.groupId,
            todayAttendance: hasAttendanceOverride
              ? (overrideAttendanceByGroupId.get(groupId) || null)
              : (attendanceByGroupId.get(groupId) || null)
          };
          if (existingPlayerIndex >= 0) {
            nextPlayers.splice(existingPlayerIndex, 0, patchedPlayer);
          } else {
            nextPlayers = [...nextPlayers, patchedPlayer];
          }
        }

        return {
          ...group,
          players: nextPlayers,
          currentCount: nextPlayers.length,
          markedCount: nextPlayers.filter((player) => Boolean(player.todayAttendance)).length,
          presentCount: nextPlayers.filter((player) => player.todayAttendance?.status === 'present').length
        };
      });

      attendanceBoardCache = nextGroups;
      attendanceBoardCacheTimestamp = Date.now();
      attendanceBoardCacheDate = selectedAttendanceDate;
      attendanceBoardCacheVersion = getCacheVersion();
      groupColumnsRef.current = nextGroups;
      return nextGroups;
    });
  };

  const syncPlayerInAttendanceBoard = (updatedPlayer, attendanceRecords = null, fallbackGroupId = '') => {
    patchPlayerInAttendanceBoard(updatedPlayer, attendanceRecords, fallbackGroupId);
  };

  const patchExistingPlayerInAttendanceBoard = (updatedPlayer) => {
    if (!updatedPlayer?._id) return;

    setGroupColumns((currentGroups) => {
      const playerId = getEntityId(updatedPlayer._id);
      const nextGroups = currentGroups.map((group) => ({
        ...group,
        players: group.players.map((player) => (
          getEntityId(player._id) === playerId
            ? {
              ...player,
              ...updatedPlayer,
              groupId: updatedPlayer.groupId || player.groupId,
              groupIds: updatedPlayer.groupIds?.length ? updatedPlayer.groupIds : player.groupIds,
              attendanceGroupId: player.attendanceGroupId || getEntityId(group._id),
              attendancePresentCount: player.attendancePresentCount,
              todayAttendance: player.todayAttendance
            }
            : player
        ))
      }));

      attendanceBoardCache = nextGroups;
      attendanceBoardCacheTimestamp = Date.now();
      attendanceBoardCacheDate = selectedAttendanceDate;
      attendanceBoardCacheVersion = getCacheVersion();
      groupColumnsRef.current = nextGroups;
      return nextGroups;
    });
  };

  const patchPlayerPaymentDueInAttendanceBoard = (playerId, paidAmount) => {
    if (!playerId || !paidAmount) return;
    setGroupColumns((currentGroups) => {
      const nextGroups = currentGroups.map((group) => ({
        ...group,
        players: group.players.map((player) => (
          getEntityId(player._id) === getEntityId(playerId)
            ? {
              ...player,
              paymentRemainingAmount: Math.max(0, Number(player.paymentRemainingAmount || 0) - Number(paidAmount || 0))
            }
            : player
        ))
      }));

      attendanceBoardCache = nextGroups;
      groupColumnsRef.current = nextGroups;
      return nextGroups;
    });
  };

  const isSelectedPlayerOpen = (playerId) => getEntityId(selectedPlayerRef.current?._id) === getEntityId(playerId);

  const setSelectedPlayerIfOpen = (player, { updateForm = true } = {}) => {
    if (!isSelectedPlayerOpen(player?._id)) {
      return;
    }

    setSelectedPlayer(player);
    if (updateForm) {
      setSelectedPlayerForm(createSelectedPlayerForm(player));
    }
  };

  const applyOptimisticSelectedPlayer = (nextPlayer, attendanceRecords = null, fallbackGroupId = '') => {
    syncPlayerInAttendanceBoard(nextPlayer, attendanceRecords, fallbackGroupId);
    setSelectedPlayerIfOpen(nextPlayer);
  };

  const beginSelectedPlayerMutation = (name) => {
    const mutation = {
      sequence: selectedPlayerMutationSequenceRef.current + 1,
      playerId: getEntityId(selectedPlayerRef.current?._id),
      sessionId: selectedPlayerLoadRequestIdRef.current
    };
    selectedPlayerMutationSequenceRef.current = mutation.sequence;
    pendingSelectedPlayerMutationRef.current = name;
    setPendingSelectedPlayerMutation(name);
    return mutation;
  };

  const isCurrentSelectedPlayerMutation = (mutation) => (
    mutation
    && selectedPlayerMutationSequenceRef.current === mutation.sequence
    && selectedPlayerLoadRequestIdRef.current === mutation.sessionId
    && isSelectedPlayerOpen(mutation.playerId)
  );

  const isLatestSelectedPlayerMutation = (mutation) => (
    mutation
    && selectedPlayerMutationSequenceRef.current === mutation.sequence
  );

  const finishSelectedPlayerMutation = (mutation) => {
    if (mutation && selectedPlayerMutationSequenceRef.current === mutation.sequence) {
      pendingSelectedPlayerMutationRef.current = '';
      setPendingSelectedPlayerMutation('');
    }
  };

  const applyPresentDeltaToPlayer = (player, presentDelta) => {
    if (!player || !presentDelta) {
      return player;
    }

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
      attendancePresentCount: Math.max(0, Number(player.attendancePresentCount || 0) + presentDelta)
    };
  };

  const getCurrentSubscriptionAttendanceIdSet = (player) => new Set(
    (player?.currentSubscriptionAttendanceIds || []).map((id) => getEntityId(id))
  );

  const getCurrentSubscriptionCycleStartValue = (player = selectedPlayer) => (
    getDateInputValue(player?.startDate || player?.subscriptionId?.startDate)
    || getDateInputValue(selectedPlayerSubscriptionHistory[0]?.startDate)
  );

  const isRecordExplicitlyCountedInCurrentSubscription = (record, player = selectedPlayer) => (
    Boolean(record?._id) && getCurrentSubscriptionAttendanceIdSet(player).has(getEntityId(record._id))
  );

  const isAttendanceRecordInSubscriptionCycle = (record, player, cycleStartOverride = '') => {
    const preciseCycleStart = cycleStartOverride;
    const cycleStart = preciseCycleStart || getCurrentSubscriptionCycleStartValue(player);

    if (isRecordExplicitlyCountedInCurrentSubscription(record, player)) {
      return true;
    }

    if (!cycleStart && !preciseCycleStart) {
      return true;
    }

    if (!cycleStart) {
      return false;
    }

    if (preciseCycleStart) {
      const recordTime = record.checkInTime || getObjectIdDate(record._id) || record.date;
      return new Date(recordTime) >= new Date(preciseCycleStart);
    }

    return getLocalDateOnly(record.date) >= getLocalDateOnly(cycleStart);
  };

  const getAttendancePresentCountForCycle = (records, player, cycleStartOverride = '') => {
    if (!Array.isArray(records)) {
      return Number(player?.attendancePresentCount || 0);
    }

    return records.filter((record) => (
      record.status === 'present'
      && isAttendanceRecordInSubscriptionCycle(record, player, cycleStartOverride)
    )).length;
  };

  const withAttendancePresentCount = (player, records, cycleStartOverride = '', groupId = '') => {
    if (!player || !Array.isArray(records)) {
      return player;
    }

    const targetGroupId = getEntityId(groupId) || getPlayerAttendanceGroupId(player);
    const attendancePresentCount = getAttendancePresentCountForCycle(records, player, cycleStartOverride);
    const totalSessions = Number(player.subscriptionId?.totalSessions || player.packageClasses || 0);
    const subscription = player.subscriptionId && typeof player.subscriptionId === 'object'
      ? {
        ...player.subscriptionId,
        usedSessions: attendancePresentCount,
        remainingSessions: totalSessions
          ? Math.max(0, totalSessions - attendancePresentCount)
          : player.subscriptionId.remainingSessions
      }
      : player.subscriptionId;

    return {
      ...player,
      attendanceGroupId: targetGroupId || player.attendanceGroupId,
      subscriptionId: subscription,
      attendancePresentCount
    };
  };

  const setAttendanceHistoryPending = (recordId) => {
    pendingAttendanceHistoryIdRef.current = recordId;
    setPendingAttendanceHistoryId(recordId);
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

    const actionSequence = attendanceActionSequenceRef.current + 1;
    attendanceActionSequenceRef.current = actionSequence;
    const playerDateKey = `${getEntityId(player._id)}:${selectedAttendanceDate}`;
    latestAttendanceActionRef.current.set(playerDateKey, actionSequence);
    const previousPlayerRecord = getAttendancePlayerFromBoard(groupColumnsRef.current, player._id, groupId);
    const previousAttendance = previousPlayerRecord?.todayAttendance || null;
    const optimisticAttendance = {
      ...(previousAttendance || {}),
      playerId: player._id,
      groupId,
      status,
      date: new Date(`${selectedAttendanceDate}T00:00:00`).toISOString(),
      checkInTime: status === 'present' ? new Date().toISOString() : undefined
    };
    const overrideKey = getLocalAttendanceOverrideKey(selectedAttendanceDate, player._id, groupId);
    localAttendanceOverridesRef.current.set(overrideKey, optimisticAttendance);

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
      if (latestAttendanceActionRef.current.get(playerDateKey) !== actionSequence) {
        return;
      }
      localAttendanceOverridesRef.current.set(overrideKey, savedAttendance);
      setPlayerAttendanceInBoard(player._id, groupId, savedAttendance);
      if (selectedPlayer?._id === player._id) {
        setSelectedPlayer((currentPlayer) => currentPlayer ? {
          ...currentPlayer,
          todayAttendance: savedAttendance
        } : currentPlayer);
      }
      setMessage('Attendance recorded');
    } catch (err) {
      if (latestAttendanceActionRef.current.get(playerDateKey) === actionSequence) {
        localAttendanceOverridesRef.current.delete(overrideKey);
        setPlayerAttendanceInBoard(player._id, groupId, previousAttendance);

        if (selectedPlayer?._id === player._id) {
          setSelectedPlayer((currentPlayer) => currentPlayer ? {
            ...currentPlayer,
            todayAttendance: previousAttendance
          } : currentPlayer);
        }
      }

      setMessage(err.response?.data?.message || 'Unable to record attendance');
    } finally {
      if (latestAttendanceActionRef.current.get(playerDateKey) === actionSequence) {
        latestAttendanceActionRef.current.delete(playerDateKey);
      }
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

    const actionSequence = attendanceActionSequenceRef.current + 1;
    attendanceActionSequenceRef.current = actionSequence;
    const playerDateKey = `${getEntityId(player._id)}:${selectedAttendanceDate}`;
    latestAttendanceActionRef.current.set(playerDateKey, actionSequence);
    const previousPlayerRecord = getAttendancePlayerFromBoard(groupColumnsRef.current, player._id, groupId);
    const previousAttendance = previousPlayerRecord?.todayAttendance || null;
    const overrideKey = getLocalAttendanceOverrideKey(selectedAttendanceDate, player._id, groupId);
    localAttendanceOverridesRef.current.delete(overrideKey);
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
      const attendanceGroupId = getEntityId(previousAttendance?.groupId) || groupId;
      await cancelTodayAttendance({ playerId: player._id, groupId: attendanceGroupId, date: selectedAttendanceDate });
      if (latestAttendanceActionRef.current.get(playerDateKey) !== actionSequence) {
        return;
      }
      setMessage('Attendance cancelled');
    } catch (err) {
      if (latestAttendanceActionRef.current.get(playerDateKey) === actionSequence) {
        if (previousAttendance) {
          localAttendanceOverridesRef.current.set(overrideKey, previousAttendance);
        }
        setPlayerAttendanceInBoard(player._id, groupId, previousAttendance);

        if (selectedPlayer?._id === player._id) {
          setSelectedPlayer((currentPlayer) => currentPlayer ? {
            ...currentPlayer,
            todayAttendance: previousAttendance
          } : currentPlayer);
        }
      }

      setMessage(err.response?.data?.message || 'Unable to cancel attendance');
    } finally {
      if (latestAttendanceActionRef.current.get(playerDateKey) === actionSequence) {
        latestAttendanceActionRef.current.delete(playerDateKey);
      }
      setAttendanceActionPending(actionKey, false);
    }
  };

  const handleSelectPlayer = async (player) => {
    const requestId = ++selectedPlayerLoadRequestIdRef.current;
    selectedPlayerFormDirtyRef.current = false;
    selectedPlayerEditRequestIdRef.current += 1;
    try {
      setMessage('');
      setSelectedPlayer(player);
      setSelectedPlayerForm(createSelectedPlayerForm(player));
      setSelectedPlayerAttendanceHistory([]);
      setSelectedPlayerSubscriptionHistory([]);
      setOpenSubscriptionHistoryKey('');
      setShowSelectedPlayerAttendanceHistory(false);
      setShowFreezeNoteDetails(false);
      setDueAdjustmentForm('');
      setEditingAttendanceHistoryId(null);
      setIsEditingSelectedPlayer(false);

      const [latestPlayer, attendanceRecords, playerHistory] = await Promise.all([
        getPlayer(player._id),
        fetchAttendanceByPlayer(player._id),
        fetchPlayerHistory(player._id)
      ]);

      if (requestId !== selectedPlayerLoadRequestIdRef.current) {
        return;
      }

      const subscriptionHistory = buildSubscriptionHistory(playerHistory.entries || [], latestPlayer)
        .filter((cycle) => !latestPlayer.startDate || getLocalDateOnly(cycle.startDate).getTime() <= getLocalDateOnly(latestPlayer.startDate).getTime());
      const latestRemainingAmount = typeof latestPlayer.paymentRemainingAmount !== 'undefined'
        ? latestPlayer.paymentRemainingAmount
        : player.paymentRemainingAmount;
      const latestPlayerWithCount = withAttendancePresentCount(
        { ...latestPlayer, paymentRemainingAmount: latestRemainingAmount, dueAdjustment: latestPlayer.dueAdjustment || 0 },
        attendanceRecords,
        getDateInputValue(subscriptionHistory[0]?.startDate),
        getPlayerAttendanceGroupId(player)
      );

      syncPlayerInAttendanceBoard(latestPlayerWithCount, attendanceRecords, getPlayerAttendanceGroupId(player));
      setSelectedPlayer(latestPlayerWithCount);
      if (!selectedPlayerFormDirtyRef.current) {
        setSelectedPlayerForm(createSelectedPlayerForm(latestPlayerWithCount));
      }
      setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      setSelectedPlayerSubscriptionHistory(subscriptionHistory);
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
    dueAdjustment: player?.dueAdjustment ?? 0,
    note: decodeDisplayText(player?.note),
    freezeNote: decodeDisplayText(player?.freezeNote),
    status: player?.status || 'active',
    showInAttendanceWhenFrozen: player?.showInAttendanceWhenFrozen !== false
  });

  const handleStartEditSelectedPlayer = async () => {
    if (!selectedPlayer?._id) {
      return;
    }

    const requestId = ++selectedPlayerEditRequestIdRef.current;
    const editingPlayerId = selectedPlayer._id;
    selectedPlayerFormDirtyRef.current = false;

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

      if (requestId !== selectedPlayerEditRequestIdRef.current || editingPlayerId !== selectedPlayer?._id) {
        return;
      }

      setEditParents(parentsData);
      setEditGroups(groupsData);
      setPackageOptions(packageData);
      setSelectedPlayer(latestPlayer);
      if (!selectedPlayerFormDirtyRef.current) {
        setSelectedPlayerForm(createSelectedPlayerForm(latestPlayer));
      }
    } catch (err) {
      if (requestId !== selectedPlayerEditRequestIdRef.current) {
        return;
      }
      setIsEditingSelectedPlayer(false);
      setSelectedPlayerForm(null);
      setMessage(err.response?.data?.message || 'Unable to open player editor');
    }
  };

  const handleSelectedPlayerFormChange = (event) => {
    const { name, value } = event.target;
    selectedPlayerFormDirtyRef.current = true;

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
    selectedPlayerFormDirtyRef.current = true;
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
    selectedPlayerFormDirtyRef.current = false;
    selectedPlayerEditRequestIdRef.current += 1;
    setIsEditingSelectedPlayer(false);
    setSelectedPlayerForm(selectedPlayer ? createSelectedPlayerForm(selectedPlayer) : null);
    setShowUnsavedExitConfirm(false);
    setPendingFrozenVisibilitySave(null);
  };

  const normalizeSelectedPlayerForm = (form) => {
    if (!form) {
      return null;
    }

    return {
      ...form,
      groupIds: [...(form.groupIds || [])].map(String).sort(),
      payment: String(form.payment ?? ''),
      packageClasses: String(form.packageClasses ?? ''),
      packageHours: String(form.packageHours ?? '')
    };
  };

  const hasUnsavedSelectedPlayerChanges = () => {
    if (!isEditingSelectedPlayer || !selectedPlayer || !selectedPlayerForm) {
      return false;
    }

    return JSON.stringify(normalizeSelectedPlayerForm(selectedPlayerForm))
      !== JSON.stringify(normalizeSelectedPlayerForm(createSelectedPlayerForm(selectedPlayer)));
  };

  const closeSelectedPlayer = ({ force = false } = {}) => {
    if (!force && hasUnsavedSelectedPlayerChanges()) {
      setShowUnsavedExitConfirm(true);
      return;
    }

    setShowUnsavedExitConfirm(false);
    setPendingFrozenVisibilitySave(null);
    selectedPlayerFormDirtyRef.current = false;
    selectedPlayerLoadRequestIdRef.current += 1;
    selectedPlayerEditRequestIdRef.current += 1;
    setIsEditingSelectedPlayer(false);
    setSelectedPlayerForm(null);
    setSelectedPlayer(null);
  };

  const openSubscriptionModal = () => {
    const startDate = getDateInputValue();
    setSubscriptionForm({
      startDate,
      endDate: getScheduledEndDateValue(startDate, selectedPlayer, groupColumns),
      scheduleMode: 'auto',
      customDays: [],
      customClasses: selectedPlayer?.packageClasses || selectedPlayer?.subscriptionId?.totalSessions || ''
    });
    setSubscriptionMessage('');
    setShowSubscriptionModal(true);
  };

  const getSubscriptionEndDate = (form) => getScheduledEndDateValue(
    form.startDate,
    selectedPlayer,
    groupColumns,
    form.scheduleMode === 'custom'
      ? {
        dayIndexes: form.customDays,
        totalClasses: form.customClasses
      }
      : {}
  );

  const handleSubscriptionStartDateChange = (startDate) => {
    setSubscriptionForm((current) => ({
      ...current,
      startDate,
      endDate: getSubscriptionEndDate({ ...current, startDate })
    }));
  };

  const handleSubscriptionScheduleModeChange = (scheduleMode) => {
    setSubscriptionForm((current) => {
      const next = { ...current, scheduleMode };
      return { ...next, endDate: getSubscriptionEndDate(next) };
    });
  };

  const handleSubscriptionCustomDayToggle = (dayIndex) => {
    setSubscriptionForm((current) => {
      const customDays = current.customDays.includes(dayIndex)
        ? current.customDays.filter((day) => day !== dayIndex)
        : [...current.customDays, dayIndex].sort((first, second) => first - second);
      const next = { ...current, customDays };
      return { ...next, endDate: getSubscriptionEndDate(next) };
    });
  };

  const handleSubscriptionCustomClassesChange = (customClasses) => {
    setSubscriptionForm((current) => {
      const next = { ...current, customClasses: normalizeDigits(customClasses) };
      return { ...next, endDate: getSubscriptionEndDate(next) };
    });
  };

  useEffect(() => {
    if (!showSubscriptionModal || !subscriptionForm.startDate) return;
    const nextEndDate = getSubscriptionEndDate(subscriptionForm);
    setSubscriptionForm((current) => (
      current.endDate === nextEndDate
        ? current
        : { ...current, endDate: nextEndDate }
    ));
  }, [showSubscriptionModal, subscriptionForm.startDate, subscriptionForm.scheduleMode, subscriptionForm.customDays, subscriptionForm.customClasses, selectedPlayer, groupColumns]);

  const handleSubscriptionSave = async (event, keepWarning = false) => {
    event.preventDefault();
    if (!selectedPlayer?._id || isSavingSubscription) {
      return;
    }

    const confirmed = window.confirm('This will start a new subscription cycle and cannot be undone. Continue?');
    if (!confirmed) return;

    const saveSequence = subscriptionSaveSequenceRef.current + 1;
    subscriptionSaveSequenceRef.current = saveSequence;
    selectedPlayerLoadRequestIdRef.current += 1;
    const previousPlayer = selectedPlayer;
    const optimisticPlayerBase = {
      ...selectedPlayer,
      startDate: subscriptionForm.startDate,
      endDate: subscriptionForm.endDate,
      status: selectedPlayer.status === 'expired' ? 'active' : selectedPlayer.status,
      subscriptionNeedsAttention: keepWarning,
      previousDueBalance: Number(selectedPlayer.paymentRemainingAmount || 0),
      dueAdjustment: 0,
      paymentRemainingAmount: Number(selectedPlayer.paymentRemainingAmount || 0) + Number(selectedPlayer.payment || 0),
      currentSubscriptionStartedAt: subscriptionForm.startDate,
      currentSubscriptionAttendanceIds: [],
      subscriptionId: selectedPlayer.subscriptionId && typeof selectedPlayer.subscriptionId === 'object'
        ? {
          ...selectedPlayer.subscriptionId,
          startDate: subscriptionForm.startDate,
          endDate: subscriptionForm.endDate,
        }
        : selectedPlayer.subscriptionId
    };
    const optimisticPlayer = withAttendancePresentCount(
      optimisticPlayerBase,
      selectedPlayerAttendanceHistory,
      subscriptionForm.startDate,
      getPlayerAttendanceGroupId(selectedPlayer)
    );

    setSubscriptionMessage('');
    setIsSavingSubscription(true);
    try {
      const optimisticCycle = {
        key: subscriptionForm.startDate,
        changedAt: new Date().toISOString(),
        startDate: subscriptionForm.startDate,
        endDate: subscriptionForm.endDate,
        packageName: selectedPlayer.packageName || '',
        packageClasses: Number(selectedPlayer.packageClasses || 0),
        packageHours: Number(selectedPlayer.packageHours || 0),
        payment: Number(selectedPlayer.payment || 0)
      };
      applyOptimisticSelectedPlayer(optimisticPlayer);
      setSelectedPlayerSubscriptionHistory((current) => [
        optimisticCycle,
        ...current.filter((cycle) => cycle.key !== optimisticCycle.key)
      ].sort((first, second) => new Date(second.startDate) - new Date(first.startDate)));
      setOpenSubscriptionHistoryKey(optimisticCycle.key);
      setShowSubscriptionModal(false);
      setMessage('New subscription started');
      const savedPlayer = await updatePlayer(selectedPlayer._id, {
        startDate: subscriptionForm.startDate,
        endDate: subscriptionForm.endDate,
        status: selectedPlayer.status === 'expired' ? 'active' : selectedPlayer.status,
        subscriptionNeedsAttention: keepWarning,
        newSubscription: true
      });
      if (subscriptionSaveSequenceRef.current !== saveSequence) {
        return;
      }

      const [attendanceData, playerHistory] = await Promise.all([
        fetchAttendanceByPlayer(selectedPlayer._id),
        fetchPlayerHistory(selectedPlayer._id)
      ]);
      const attendanceRecords = applyLocalPlayerAttendanceOverrides(attendanceData, selectedPlayer._id);
      const refreshedHistory = buildSubscriptionHistory(playerHistory.entries || [], savedPlayer)
        .filter((cycle) => !savedPlayer.startDate || getLocalDateOnly(cycle.startDate).getTime() <= getLocalDateOnly(savedPlayer.startDate).getTime());

      const countedPlayer = withAttendancePresentCount(
        savedPlayer,
        attendanceRecords,
        subscriptionForm.startDate,
        getPlayerAttendanceGroupId(selectedPlayer)
      );
      const refreshedPlayerWithCount = {
        ...countedPlayer,
        dueAdjustment: Number(savedPlayer.dueAdjustment || 0),
        paymentRemainingAmount: typeof savedPlayer.paymentRemainingAmount !== 'undefined'
          ? savedPlayer.paymentRemainingAmount
          : Math.max(
            0,
            Number(savedPlayer.previousDueBalance || 0)
              + Number(savedPlayer.payment || 0)
              - Number(savedPlayer.dueAdjustment || 0)
          )
      };

      syncPlayerInAttendanceBoard(refreshedPlayerWithCount, attendanceRecords, getPlayerAttendanceGroupId(selectedPlayer));
      setSelectedPlayerIfOpen(refreshedPlayerWithCount);
      if (isSelectedPlayerOpen(refreshedPlayerWithCount._id)) {
        setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
        setSelectedPlayerSubscriptionHistory(refreshedHistory);
        setOpenSubscriptionHistoryKey(getDateInputValue(refreshedHistory[0]?.startDate) || subscriptionForm.startDate);
      }
    } catch (error) {
      if (subscriptionSaveSequenceRef.current === saveSequence) {
        applyOptimisticSelectedPlayer(previousPlayer);
        if (isSelectedPlayerOpen(previousPlayer._id)) {
          setShowSubscriptionModal(true);
        }
      }
      setSubscriptionMessage(error.response?.data?.message || 'Unable to start a new subscription.');
    } finally {
      setIsSavingSubscription(false);
    }
  };

  const handleClearSubscriptionAttention = async () => {
    if (!selectedPlayer?._id) {
      return;
    }
    if (pendingSelectedPlayerMutationRef.current) {
      return;
    }

    const mutation = beginSelectedPlayerMutation('subscription-attention');
    const previousPlayer = selectedPlayer;
    const optimisticPlayer = {
      ...selectedPlayer,
      subscriptionNeedsAttention: false
    };

    try {
      setMessage('');
      patchExistingPlayerInAttendanceBoard(optimisticPlayer);
      setSelectedPlayerIfOpen(optimisticPlayer);
      setMessage('Subscription warning cleared');
      await updatePlayer(selectedPlayer._id, { subscriptionNeedsAttention: false });
      const refreshedPlayer = await getPlayer(selectedPlayer._id, { force: true });
      if (!isLatestSelectedPlayerMutation(mutation)) {
        return;
      }
      patchExistingPlayerInAttendanceBoard(refreshedPlayer);
      setSelectedPlayerIfOpen(refreshedPlayer);
    } catch (error) {
      if (isLatestSelectedPlayerMutation(mutation)) {
        patchExistingPlayerInAttendanceBoard(previousPlayer);
        setSelectedPlayerIfOpen(previousPlayer);
        if (isCurrentSelectedPlayerMutation(mutation)) {
          setMessage(error.response?.data?.message || 'Unable to clear subscription warning');
        }
      }
    } finally {
      finishSelectedPlayerMutation(mutation);
    }
  };

  const handleSetSubscriptionAttention = async () => {
    if (!selectedPlayer?._id) {
      return;
    }
    if (pendingSelectedPlayerMutationRef.current) {
      return;
    }

    const mutation = beginSelectedPlayerMutation('subscription-attention');
    const previousPlayer = selectedPlayer;
    const optimisticPlayer = {
      ...selectedPlayer,
      subscriptionNeedsAttention: true
    };

    try {
      setMessage('');
      patchExistingPlayerInAttendanceBoard(optimisticPlayer);
      setSelectedPlayerIfOpen(optimisticPlayer);
      setMessage('Subscription warning enabled');
      await updatePlayer(selectedPlayer._id, { subscriptionNeedsAttention: true });
      const refreshedPlayer = await getPlayer(selectedPlayer._id, { force: true });
      if (!isLatestSelectedPlayerMutation(mutation)) {
        return;
      }
      patchExistingPlayerInAttendanceBoard(refreshedPlayer);
      setSelectedPlayerIfOpen(refreshedPlayer);
    } catch (error) {
      if (isLatestSelectedPlayerMutation(mutation)) {
        patchExistingPlayerInAttendanceBoard(previousPlayer);
        setSelectedPlayerIfOpen(previousPlayer);
        if (isCurrentSelectedPlayerMutation(mutation)) {
          setMessage(error.response?.data?.message || 'Unable to mark subscription warning');
        }
      }
    } finally {
      finishSelectedPlayerMutation(mutation);
    }
  };

  const handleAttendanceAlertToggle = async (isEnabled) => {
    if (!selectedPlayer?._id) {
      return;
    }
    if (pendingSelectedPlayerMutationRef.current) {
      return;
    }

    const mutation = beginSelectedPlayerMutation('attendance-alert');
    const previousPlayer = selectedPlayer;
    const optimisticPlayer = {
      ...selectedPlayer,
      attendanceAlertEnabled: isEnabled
    };

    try {
      setMessage('');
      patchExistingPlayerInAttendanceBoard(optimisticPlayer);
      setSelectedPlayerIfOpen(optimisticPlayer);
      setMessage(isEnabled ? 'Attendance alert dot enabled' : 'Attendance alert dot cleared');
      await updatePlayer(selectedPlayer._id, { attendanceAlertEnabled: isEnabled });
      const refreshedPlayer = await getPlayer(selectedPlayer._id, { force: true });
      if (!isLatestSelectedPlayerMutation(mutation)) {
        return;
      }
      patchExistingPlayerInAttendanceBoard(refreshedPlayer);
      setSelectedPlayerIfOpen(refreshedPlayer);
    } catch (error) {
      if (isLatestSelectedPlayerMutation(mutation)) {
        patchExistingPlayerInAttendanceBoard(previousPlayer);
        setSelectedPlayerIfOpen(previousPlayer);
        if (isCurrentSelectedPlayerMutation(mutation)) {
          setMessage(error.response?.data?.message || 'Unable to update attendance alert dot');
        }
      }
    } finally {
      finishSelectedPlayerMutation(mutation);
    }
  };

  const handleApplyDueAdjustment = async (mode = 'add') => {
    if (!selectedPlayer?._id) return;
    const amount = parseLocalizedNumber(dueAdjustmentForm);
    if (!amount && mode !== 'clear') return;
    const currentAdjustment = Number(selectedPlayer.dueAdjustment || 0);
    const currentDue = Number(selectedPlayer.paymentRemainingAmount || 0);
    const naturalDue = currentDue + currentAdjustment;
    const nextAdjustment = mode === 'clear'
      ? 0
      : Math.max(0, currentAdjustment + Math.min(amount, currentDue));
    const optimisticPlayer = {
      ...selectedPlayer,
      dueAdjustment: nextAdjustment,
      paymentRemainingAmount: Math.max(0, naturalDue - nextAdjustment)
    };
    const previousPlayer = selectedPlayer;

    try {
      setMessage('');
      setIsSavingDueAdjustment(true);
      patchExistingPlayerInAttendanceBoard(optimisticPlayer);
      setSelectedPlayerIfOpen(optimisticPlayer);
      setDueAdjustmentForm('');
      await updatePlayer(selectedPlayer._id, { dueAdjustment: nextAdjustment });
      const refreshedPlayer = await getPlayer(selectedPlayer._id, { force: true });
      const attendanceRecords = await fetchAttendanceByPlayer(selectedPlayer._id);
      const refreshedPlayerWithCount = withAttendancePresentCount(refreshedPlayer, attendanceRecords);
      const confirmedPlayer = {
        ...refreshedPlayerWithCount,
        paymentRemainingAmount: optimisticPlayer.paymentRemainingAmount
      };
      patchExistingPlayerInAttendanceBoard(confirmedPlayer);
      setSelectedPlayerIfOpen(confirmedPlayer);
      setMessage(mode === 'clear' ? 'Due adjustment cleared' : 'Due reduced');
    } catch (error) {
      patchExistingPlayerInAttendanceBoard(previousPlayer);
      setSelectedPlayerIfOpen(previousPlayer);
      setMessage(error.response?.data?.message || 'Unable to update due');
    } finally {
      setIsSavingDueAdjustment(false);
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

    const previousPlayer = selectedPlayer;
    const previousRecords = selectedPlayerAttendanceHistory;
    const optimisticRecord = {
      ...record,
      status,
      checkInTime: status === 'present' ? (record.checkInTime || new Date().toISOString()) : undefined
    };
    const optimisticRecords = previousRecords.map((item) => (
      item._id === record._id ? optimisticRecord : item
    ));
    const presentDelta = (record.status === 'present' ? -1 : 0) + (status === 'present' ? 1 : 0);
    const optimisticPlayer = applyPresentDeltaToPlayer(selectedPlayer, presentDelta);

    try {
      setMessage('');
      setAttendanceHistoryPending(record._id);
      setSelectedPlayerAttendanceHistory(optimisticRecords);
      applyOptimisticSelectedPlayer(optimisticPlayer, optimisticRecords, groupId);
      setMessage('Attendance history updated');
      await updateTodayAttendance({
        playerId: selectedPlayer._id,
        groupId,
        status,
        date: getDateInputValue(record.date)
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id, { force: true }),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      const refreshedPlayerWithCount = withAttendancePresentCount(refreshedPlayer, attendanceRecords, '', groupId);

      syncPlayerInAttendanceBoard(refreshedPlayerWithCount, attendanceRecords, groupId);
      setSelectedPlayerIfOpen(refreshedPlayerWithCount);
      if (isSelectedPlayerOpen(refreshedPlayerWithCount._id)) {
        setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      }
      setEditingAttendanceHistoryId(null);
    } catch (error) {
      setSelectedPlayerAttendanceHistory(previousRecords);
      applyOptimisticSelectedPlayer(previousPlayer, previousRecords, groupId);
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

    const previousPlayer = selectedPlayer;
    const previousRecords = selectedPlayerAttendanceHistory;
    const optimisticRecords = previousRecords.filter((item) => item._id !== record._id);
    const optimisticPlayer = applyPresentDeltaToPlayer(selectedPlayer, record.status === 'present' ? -1 : 0);

    try {
      setMessage('');
      setAttendanceHistoryPending(record._id);
      setSelectedPlayerAttendanceHistory(optimisticRecords);
      applyOptimisticSelectedPlayer(optimisticPlayer, optimisticRecords, groupId);
      setMessage('Attendance history record removed');
      await cancelTodayAttendance({
        playerId: selectedPlayer._id,
        groupId,
        date: getDateInputValue(record.date)
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id, { force: true }),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      const refreshedPlayerWithCount = withAttendancePresentCount(refreshedPlayer, attendanceRecords, '', groupId);

      syncPlayerInAttendanceBoard(refreshedPlayerWithCount, attendanceRecords, groupId);
      setSelectedPlayerIfOpen(refreshedPlayerWithCount);
      if (isSelectedPlayerOpen(refreshedPlayerWithCount._id)) {
        setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      }
      setEditingAttendanceHistoryId(null);
    } catch (error) {
      setSelectedPlayerAttendanceHistory(previousRecords);
      applyOptimisticSelectedPlayer(previousPlayer, previousRecords, groupId);
      setMessage(error.response?.data?.message || 'Unable to remove attendance history record');
    } finally {
      setAttendanceHistoryPending(null);
    }
  };

  const handleCountAttendanceInCurrentSubscription = async (record) => {
    if (!selectedPlayer?._id || !record?._id) {
      return;
    }
    if (pendingAttendanceHistoryIdRef.current) {
      return;
    }

    const confirmed = window.confirm('Count this attendance record as part of the current subscription?');
    if (!confirmed) {
      return;
    }

    const previousPlayer = selectedPlayer;
    const previousRecords = selectedPlayerAttendanceHistory;
    const nextCurrentSubscriptionAttendanceIds = [
      ...getCurrentSubscriptionAttendanceIdSet(selectedPlayer),
      getEntityId(record._id)
    ];
    const groupId = getEntityId(record.groupId) || getPlayerAttendanceGroupId(selectedPlayer);
    const optimisticPlayer = withAttendancePresentCount({
      ...selectedPlayer,
      currentSubscriptionAttendanceIds: nextCurrentSubscriptionAttendanceIds
    }, previousRecords, '', groupId);

    try {
      setMessage('');
      setAttendanceHistoryPending(record._id);
      applyOptimisticSelectedPlayer(optimisticPlayer, previousRecords, groupId);
      setMessage('Attendance record counted in current subscription');
      await updatePlayer(selectedPlayer._id, {
        currentSubscriptionAttendanceIds: nextCurrentSubscriptionAttendanceIds
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id, { force: true }),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      const refreshedPlayerWithCount = withAttendancePresentCount(refreshedPlayer, attendanceRecords, '', groupId);

      syncPlayerInAttendanceBoard(refreshedPlayerWithCount, attendanceRecords, groupId);
      setSelectedPlayerIfOpen(refreshedPlayerWithCount);
      if (isSelectedPlayerOpen(refreshedPlayerWithCount._id)) {
        setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      }
      setEditingAttendanceHistoryId(null);
    } catch (error) {
      setSelectedPlayerAttendanceHistory(previousRecords);
      applyOptimisticSelectedPlayer(previousPlayer, previousRecords, groupId);
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

    const previousPlayer = selectedPlayer;
    const previousRecords = selectedPlayerAttendanceHistory;
    const nextCurrentSubscriptionAttendanceIds = [...getCurrentSubscriptionAttendanceIdSet(selectedPlayer)]
      .filter((recordId) => recordId !== getEntityId(record._id));
    const groupId = getEntityId(record.groupId) || getPlayerAttendanceGroupId(selectedPlayer);
    const optimisticPlayer = withAttendancePresentCount({
      ...selectedPlayer,
      currentSubscriptionAttendanceIds: nextCurrentSubscriptionAttendanceIds
    }, previousRecords, '', groupId);

    try {
      setMessage('');
      setAttendanceHistoryPending(record._id);
      applyOptimisticSelectedPlayer(optimisticPlayer, previousRecords, groupId);
      setMessage('Attendance record removed from current subscription');
      await updatePlayer(selectedPlayer._id, {
        currentSubscriptionAttendanceIds: nextCurrentSubscriptionAttendanceIds
      });

      const [refreshedPlayer, attendanceRecords] = await Promise.all([
        getPlayer(selectedPlayer._id, { force: true }),
        fetchAttendanceByPlayer(selectedPlayer._id)
      ]);

      const refreshedPlayerWithCount = withAttendancePresentCount(refreshedPlayer, attendanceRecords, '', groupId);

      syncPlayerInAttendanceBoard(refreshedPlayerWithCount, attendanceRecords, groupId);
      setSelectedPlayerIfOpen(refreshedPlayerWithCount);
      if (isSelectedPlayerOpen(refreshedPlayerWithCount._id)) {
        setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      }
      setEditingAttendanceHistoryId(null);
    } catch (error) {
      setSelectedPlayerAttendanceHistory(previousRecords);
      applyOptimisticSelectedPlayer(previousPlayer, previousRecords, groupId);
      setMessage(error.response?.data?.message || 'Unable to remove this attendance from current subscription');
    } finally {
      setAttendanceHistoryPending(null);
    }
  };

  const handleRevertCurrentSubscription = async () => {
    if (!selectedPlayer?._id || pendingSelectedPlayerMutationRef.current) return;
    const currentKey = getDateInputValue(selectedPlayer.startDate);
    const currentIndex = selectedPlayerSubscriptionHistory.findIndex((cycle) => cycle.key === currentKey);
    const previousCycle = selectedPlayerSubscriptionHistory[(currentIndex >= 0 ? currentIndex : 0) + 1];

    if (!previousCycle) {
      setMessage('No previous subscription found.');
      return;
    }

    const confirmed = window.confirm('Revert this player to the previous subscription and remove the current subscription setup?');
    if (!confirmed) return;

    const mutation = beginSelectedPlayerMutation('revert-subscription');
    const previousPlayer = selectedPlayer;
    const payload = {
      startDate: getDateInputValue(previousCycle.startDate),
      endDate: getDateInputValue(previousCycle.endDate),
      packageName: previousCycle.packageName || '',
      packageClasses: Number(previousCycle.packageClasses || 0),
      packageHours: Number(previousCycle.packageHours || 0),
      payment: Number(previousCycle.payment || 0),
      dueAdjustment: 0,
      currentSubscriptionStartedAt: getDateInputValue(previousCycle.startDate),
      currentSubscriptionAttendanceIds: []
    };
    const optimisticPlayer = {
      ...selectedPlayer,
      ...payload
    };

    try {
      setMessage('');
      applyOptimisticSelectedPlayer(optimisticPlayer);
      setMessage('Subscription reverted');
      await updatePlayer(selectedPlayer._id, payload);

      const [refreshedPlayer, attendanceRecords, playerHistory] = await Promise.all([
        getPlayer(selectedPlayer._id, { force: true }),
        fetchAttendanceByPlayer(selectedPlayer._id),
        fetchPlayerHistory(selectedPlayer._id)
      ]);

      if (!isLatestSelectedPlayerMutation(mutation)) return;

      const refreshedHistory = buildSubscriptionHistory(playerHistory.entries || [], refreshedPlayer)
        .filter((cycle) => getLocalDateOnly(cycle.startDate).getTime() <= getLocalDateOnly(refreshedPlayer.startDate).getTime());
      const refreshedPlayerWithCount = withAttendancePresentCount(
        refreshedPlayer,
        attendanceRecords,
        getDateInputValue(refreshedHistory[0]?.startDate)
      );

      syncPlayerInAttendanceBoard(refreshedPlayerWithCount, attendanceRecords);
      setSelectedPlayerIfOpen(refreshedPlayerWithCount);
      setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
      setSelectedPlayerSubscriptionHistory(refreshedHistory);
      setOpenSubscriptionHistoryKey(getDateInputValue(refreshedHistory[0]?.startDate));
    } catch (error) {
      if (isLatestSelectedPlayerMutation(mutation)) {
        applyOptimisticSelectedPlayer(previousPlayer);
        setMessage(error.response?.data?.message || 'Unable to revert subscription');
      }
    } finally {
      finishSelectedPlayerMutation(mutation);
    }
  };

  const handleSaveSelectedPlayerEdit = async (event, options = {}) => {
    event?.preventDefault();
    if (!selectedPlayer?._id || !selectedPlayerForm) {
      return;
    }
    if (pendingSelectedPlayerMutationRef.current) {
      return;
    }

    const shouldCloseAfterSave = Boolean(options.closeAfterSave);
    const previousPlayer = selectedPlayer;
    const selectedParent = editParents.find((parent) => getEntityId(parent._id) === getEntityId(selectedPlayerForm.parentId));
    const selectedGroupRefs = selectedPlayerForm.groupIds
      .map((groupId) => editGroups.find((group) => getEntityId(group._id) === getEntityId(groupId)) || { _id: groupId, name: '' });
    const becameFrozen = selectedPlayer.status !== 'frozen' && selectedPlayerForm.status === 'frozen';
    const leftFrozen = selectedPlayer.status === 'frozen' && selectedPlayerForm.status !== 'frozen';
    let showInAttendanceWhenFrozen = selectedPlayerForm.showInAttendanceWhenFrozen !== false;
    if (becameFrozen && typeof options.showInAttendanceWhenFrozen !== 'boolean') {
      setPendingFrozenVisibilitySave({ closeAfterSave: shouldCloseAfterSave });
      return;
    }
    if (becameFrozen) {
      showInAttendanceWhenFrozen = options.showInAttendanceWhenFrozen;
    }
    if (leftFrozen) {
      showInAttendanceWhenFrozen = true;
    }
    selectedPlayerLoadRequestIdRef.current += 1;
    selectedPlayerEditRequestIdRef.current += 1;
    const mutation = beginSelectedPlayerMutation('player-edit');
    const updatePayload = {
      ...selectedPlayerForm,
      groupId: selectedPlayerForm.groupIds[0] || '',
      groupIds: selectedPlayerForm.groupIds,
      packageClasses: parseLocalizedNumber(selectedPlayerForm.packageClasses),
      packageHours: parseLocalizedNumber(selectedPlayerForm.packageHours),
      payment: parseLocalizedNumber(selectedPlayerForm.payment),
      freezeNote: selectedPlayerForm.status === 'frozen' ? selectedPlayerForm.freezeNote : '',
      showInAttendanceWhenFrozen
    };
    const optimisticPlayer = {
      ...selectedPlayer,
      ...updatePayload,
      parentId: selectedParent
        ? {
          ...selectedParent,
          phone: selectedParent.phone || selectedPlayerForm.parentPhone || ''
        }
        : selectedPlayer.parentId,
      parentPhone: selectedPlayerForm.parentPhone,
      groupId: selectedGroupRefs[0] || null,
      groupIds: selectedGroupRefs,
      note: selectedPlayerForm.note,
      freezeNote: selectedPlayerForm.status === 'frozen' ? selectedPlayerForm.freezeNote : ''
    };

    try {
      setMessage('');
      setShowUnsavedExitConfirm(false);
      setPendingFrozenVisibilitySave(null);
      applyOptimisticSelectedPlayer(optimisticPlayer);
      selectedPlayerFormDirtyRef.current = false;
      setIsEditingSelectedPlayer(false);
      setMessage('Player updated successfully');
      if (shouldCloseAfterSave) {
        closeSelectedPlayer({ force: true });
      }
      const savedPlayer = await updatePlayer(selectedPlayer._id, updatePayload);

      if (!isLatestSelectedPlayerMutation(mutation)) {
        return;
      }

      const [attendanceRecords, playerHistory] = await Promise.all([
        fetchAttendanceByPlayer(selectedPlayer._id),
        fetchPlayerHistory(selectedPlayer._id)
      ]);
      const confirmedPlayer = {
        ...optimisticPlayer,
        ...savedPlayer,
        parentId: optimisticPlayer.parentId,
        groupId: optimisticPlayer.groupId,
        groupIds: optimisticPlayer.groupIds
      };
      const refreshedPlayerWithCount = withAttendancePresentCount(confirmedPlayer, attendanceRecords);
      const refreshedHistory = buildSubscriptionHistory(playerHistory.entries || [], confirmedPlayer)
        .filter((cycle) => !confirmedPlayer.startDate || getLocalDateOnly(cycle.startDate).getTime() <= getLocalDateOnly(confirmedPlayer.startDate).getTime());

      syncPlayerInAttendanceBoard(refreshedPlayerWithCount, attendanceRecords);
      if (!shouldCloseAfterSave) {
        setSelectedPlayerIfOpen(refreshedPlayerWithCount);
        setSelectedPlayerAttendanceHistory(getRecentAttendanceRecords(attendanceRecords));
        setSelectedPlayerSubscriptionHistory(refreshedHistory);
        setOpenSubscriptionHistoryKey(getDateInputValue(refreshedHistory[0]?.startDate) || getCurrentSubscriptionCycleStartValue(refreshedPlayerWithCount));
      }
    } catch (err) {
      if (isLatestSelectedPlayerMutation(mutation)) {
        applyOptimisticSelectedPlayer(previousPlayer);
      }
      if (isCurrentSelectedPlayerMutation(mutation)) {
        setSelectedPlayerForm(selectedPlayerForm);
        setIsEditingSelectedPlayer(true);
        selectedPlayerFormDirtyRef.current = true;
      }
      setPendingFrozenVisibilitySave(null);
      setMessage(err.response?.data?.message || 'Unable to update player');
    } finally {
      finishSelectedPlayerMutation(mutation);
    }
  };

  const formatGroupTime = (group) => [group.startTime, group.endTime].filter(Boolean).join(' - ');
  const formatDate = (date) => date ? new Date(date).toLocaleDateString() : t('notSet');
  const getRecentAttendanceRecords = (records) => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return records.filter((record) => new Date(record.date) >= threeMonthsAgo);
  };
  const getSubscriptionStartValue = (snapshot, allowInitialFallback = false) => (
    snapshot?.startDate
    || (allowInitialFallback ? (snapshot?.currentSubscriptionStartedAt || snapshot?.createdAt || '') : '')
  );
  const getSubscriptionCycleStartDate = (snapshot, allowInitialFallback = false) => getDateInputValue(getSubscriptionStartValue(snapshot, allowInitialFallback));
  const getSubscriptionHistoryKey = (snapshot, allowInitialFallback = false) => getSubscriptionCycleStartDate(snapshot, allowInitialFallback);
  const upsertSubscriptionCycle = (cyclesByKey, snapshot, changedAt, allowInitialFallback = false) => {
    if (!snapshot) return;
    const key = getSubscriptionHistoryKey(snapshot, allowInitialFallback);
    if (!key) return;
    cyclesByKey.set(key, {
      key,
      changedAt,
      startDate: getSubscriptionStartValue(snapshot, allowInitialFallback),
      endDate: snapshot.endDate,
      packageName: snapshot.packageName || '',
      packageClasses: Number(snapshot.packageClasses || 0),
      packageHours: Number(snapshot.packageHours || 0),
      payment: Number(snapshot.payment || 0)
    });
  };
  const cycleHasPackageDetails = (cycle) => (
    Boolean(cycle.packageName)
    || Number(cycle.packageClasses || 0) > 0
    || Number(cycle.payment || 0) > 0
  );
  const normalizeSubscriptionCycles = (cycles) => {
    const sortedAsc = [...cycles]
      .filter((cycle) => cycle.startDate)
      .sort((first, second) => new Date(first.startDate) - new Date(second.startDate));
    const meaningfulCycles = [];

    sortedAsc.forEach((cycle) => {
      const previous = meaningfulCycles[meaningfulCycles.length - 1];
      const startsInsidePrevious = previous?.endDate
        && getLocalDateOnly(cycle.startDate).getTime() <= getLocalDateOnly(previous.endDate).getTime();

      if (startsInsidePrevious && !cycleHasPackageDetails(cycle)) {
        return;
      }

      meaningfulCycles.push(cycle);
    });

    return meaningfulCycles;
  };
  const buildSubscriptionHistory = (entries = [], player = null) => {
    const cyclesByKey = new Map();
    const sortedEntries = [...entries].sort((first, second) => new Date(first.changedAt) - new Date(second.changedAt));
    const initialEntry = sortedEntries.find((entry) => (
      entry.after
      && (entry.action === 'create' || Number(entry.after.packageClasses || 0) > 0 || entry.after.packageName)
    ));
    upsertSubscriptionCycle(cyclesByKey, initialEntry?.after || player, initialEntry?.changedAt || new Date().toISOString(), true);
    sortedEntries.forEach((entry) => {
      const changedFields = entry.changedFields || [];
      const subscriptionFields = ['startDate', 'endDate', 'packageName', 'packageClasses', 'packageHours', 'payment'];
      const isSubscriptionSnapshot = entry.after?.startDate
        && changedFields.some((field) => subscriptionFields.includes(field));
      if (isSubscriptionSnapshot) {
        upsertSubscriptionCycle(cyclesByKey, entry.after, entry.changedAt);
      }
    });
    if (player) {
      upsertSubscriptionCycle(cyclesByKey, player, new Date().toISOString(), cyclesByKey.size === 0);
    }
    return normalizeSubscriptionCycles([...cyclesByKey.values()])
      .sort((first, second) => new Date(second.startDate) - new Date(first.startDate));
  };
  const getAttendanceRecordsForSubscription = (records, cycle, cycles) => {
    const sortedAsc = [...cycles].sort((first, second) => new Date(first.startDate) - new Date(second.startDate));
    const cycleIndex = sortedAsc.findIndex((item) => item.key === cycle.key);
    const nextCycle = sortedAsc[cycleIndex + 1];
    const startTime = getLocalDateOnly(cycle.startDate).getTime();
    const nextStartTime = nextCycle ? getLocalDateOnly(nextCycle.startDate).getTime() : null;
    const currentCycleKey = getCurrentSubscriptionCycleStartValue();
    const isCurrentCycle = cycle.key === currentCycleKey;
    return records.filter((record) => {
      if (isRecordExplicitlyCountedInCurrentSubscription(record)) {
        return isCurrentCycle;
      }
      const recordTime = getLocalDateOnly(record.date).getTime();
      return recordTime >= startTime && (!nextStartTime || recordTime < nextStartTime);
    });
  };
  const isCurrentSubscriptionAttendanceRecord = (record) => {
    if (isRecordExplicitlyCountedInCurrentSubscription(record)) {
      return true;
    }

    const cycleStart = getCurrentSubscriptionCycleStartValue();

    if (!cycleStart) {
      return true;
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
        player.parentId?.name
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
          <div className="attendance-board-loading" role="status" aria-live="polite">
            <span className="loading-spinner" />
            <strong>{t('loadingAttendanceBoard')}</strong>
          </div>
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
                    const remainingAmount = Number(player.paymentRemainingAmount || 0);
                    const adminStatusLabel = isExpired
                      ? (player.subscriptionNeedsAttention ? 'Review' : 'Expired')
                      : (isFrozen ? t('frozenStatus') : (player.status && player.status !== 'active' ? player.status : ''));
                    return (
                      <article className={`attendance-player-card${isFrozen ? ' is-frozen' : ''}${isExpired ? ' is-expired' : ''}${player.attendanceAlertEnabled ? ' is-attention-alert' : ''}`} key={player._id}>
                        {player.attendanceAlertEnabled && <span className="attendance-review-pulse" aria-hidden="true" />}
                        <button type="button" className="attendance-player-main" onClick={() => handleSelectPlayer(player)}>
                          <strong>{player.fullName}</strong>
                          <span>{player.parentId?.name || t('noParent')}</span>
                          <em className="attendance-package-counter">
                            {packageCounter.total > 0 ? `${packageCounter.used}/${packageCounter.total}` : packageCounter.used}
                          </em>
                          {remainingAmount > 0 && (
                            <em className="attendance-money-due">Due {formatCompactMoney(remainingAmount)}</em>
                          )}
                          {isExpired && (
                            <em className="attendance-expired-badge">{player.subscriptionNeedsAttention ? 'Review' : 'Expired'}</em>
                          )}
                          {isFrozen && (
                            <em className="attendance-frozen-badge">❄ {t('frozenStatus')}</em>
                          )}
                          {!isExpired && !isFrozen && adminStatusLabel && (
                            <em className="attendance-admin-status-badge">{adminStatusLabel}</em>
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
          <div className="student-modal-backdrop" role="presentation" onClick={() => closeSelectedPlayer()}>
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
                  <button type="button" className="btn-secondary" onClick={() => closeSelectedPlayer()}>{t('close')}</button>
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
                    <div>
                      <span>{t('status')}</span>
                      <strong>{selectedPlayer.status || t('notSet')}</strong>
                      {selectedPlayer.status === 'frozen' && selectedPlayer.freezeNote && (
                        <button type="button" className="freeze-note-toggle" onClick={() => setShowFreezeNoteDetails((current) => !current)}>
                          {showFreezeNoteDetails ? 'Hide freeze note' : 'Show freeze note'} ▾
                        </button>
                      )}
                    </div>
                    {selectedPlayer.status === 'frozen' && selectedPlayer.freezeNote && showFreezeNoteDetails && (
                      <div className="student-info-grid-full freeze-note-panel">
                        <span>Freeze note</span>
                        <strong>{decodeDisplayText(selectedPlayer.freezeNote)}</strong>
                      </div>
                    )}
                    <div><span>{t('startDate')}</span><strong>{formatDate(selectedPlayer.startDate)}</strong></div>
                    <div><span>{t('endDate')}</span><strong>{formatDate(selectedPlayer.endDate)}</strong></div>
                    <div><span>{t('package')}</span><strong>{selectedPlayer.packageName ? (selectedPlayer.packageName === 'custom' ? t('customPackage') : selectedPlayer.packageName) : t('notSet')}</strong></div>
                    <div><span>{t('payment')}</span><strong>{selectedPlayer.payment ?? 0}</strong></div>
                    <div><span>{t('classes')}</span><strong>{selectedPlayer.packageClasses ?? 0}</strong></div>
                    <div><span>{t('hours')}</span><strong>{selectedPlayer.packageHours ?? 0}</strong></div>
                    <div className="student-info-grid-full due-adjustment-box">
                      <div>
                        <span>Attendance due</span>
                        <strong>Due {formatCompactMoney(selectedPlayer.paymentRemainingAmount || 0)}</strong>
                        <small>Manual reduction {formatCompactMoney(selectedPlayer.dueAdjustment || 0)}</small>
                      </div>
                      <div className="due-adjustment-actions">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={dueAdjustmentForm}
                          onChange={(event) => setDueAdjustmentForm(normalizeDigits(event.target.value))}
                          placeholder="Amount to reduce"
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => handleApplyDueAdjustment('add')}
                          disabled={isSavingDueAdjustment || !parseLocalizedNumber(dueAdjustmentForm)}
                        >
                          {isSavingDueAdjustment ? 'Saving...' : 'Reduce due'}
                        </button>
                        {Number(selectedPlayer.dueAdjustment || 0) > 0 && (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleApplyDueAdjustment('clear')}
                            disabled={isSavingDueAdjustment}
                          >
                            Clear reduction
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={`student-info-grid-full subscription-attention-box${selectedPlayer.subscriptionNeedsAttention ? ' is-active' : ''}`}>
                      <span>Subscription highlight</span>
                      <strong>
                        {selectedPlayer.subscriptionNeedsAttention
                          ? 'This player is intentionally highlighted.'
                          : 'Mark this player red for admin review.'}
                      </strong>
                      {selectedPlayer.subscriptionNeedsAttention ? (
                        <button type="button" className="btn-secondary" onClick={handleClearSubscriptionAttention} disabled={Boolean(pendingSelectedPlayerMutation)}>Clear red highlight</button>
                      ) : (
                        <button type="button" className="btn-secondary" onClick={handleSetSubscriptionAttention} disabled={Boolean(pendingSelectedPlayerMutation)}>Set highlight</button>
                      )}
                    </div>
                    <div className={`student-info-grid-full subscription-attention-box${selectedPlayer.attendanceAlertEnabled ? ' is-active' : ''}`}>
                      <span>Attendance alert dot</span>
                      <strong>
                        {selectedPlayer.attendanceAlertEnabled
                          ? 'A pulsing red dot is visible on this attendance card.'
                          : 'Show a pulsing red dot on this attendance card.'}
                      </strong>
                      {selectedPlayer.attendanceAlertEnabled ? (
                        <button type="button" className="btn-secondary" onClick={() => handleAttendanceAlertToggle(false)} disabled={Boolean(pendingSelectedPlayerMutation)}>Clear alert dot</button>
                      ) : (
                        <button type="button" className="btn-secondary" onClick={() => handleAttendanceAlertToggle(true)} disabled={Boolean(pendingSelectedPlayerMutation)}>Enable alert dot</button>
                      )}
                    </div>
                    {selectedPlayer.note && (
                      <div className="student-info-grid-full"><span>{t('note')}</span><strong>{decodeDisplayText(selectedPlayer.note)}</strong></div>
                    )}
                  </div>
                  <div className="student-modal-history-panel">
                    <div className="subscription-history-toolbar">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowSelectedPlayerAttendanceHistory((current) => !current)}
                      >
                        Attendance History
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleStartEditSelectedPlayer}
                        disabled={Boolean(pendingSelectedPlayerMutation)}
                      >
                        Edit current class dates
                      </button>
                      {selectedPlayerSubscriptionHistory.length > 1 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleRevertCurrentSubscription}
                          disabled={Boolean(pendingSelectedPlayerMutation)}
                        >
                          Revert to previous class
                        </button>
                      )}
                    </div>
                    {showSelectedPlayerAttendanceHistory && (
                      <div className="student-history-list">
                        {selectedPlayerSubscriptionHistory.length ? selectedPlayerSubscriptionHistory.map((cycle) => {
                          const records = getAttendanceRecordsForSubscription(selectedPlayerAttendanceHistory, cycle, selectedPlayerSubscriptionHistory);
                          const presentCount = records.filter((record) => record.status === 'present').length;
                          const isOpen = openSubscriptionHistoryKey === cycle.key;
                          const isCurrentCycle = cycle.key === getDateInputValue(selectedPlayer.startDate);
                          return (
                            <div className="subscription-history-group" key={cycle.key}>
                              <button type="button" className={`subscription-history-summary${isCurrentCycle ? ' is-current-subscription' : ''}`} onClick={() => setOpenSubscriptionHistoryKey(isOpen ? '' : cycle.key)}>
                                <span>
                                  <strong>{cycle.packageName || 'Subscription'}</strong>
                                  <small>{formatDate(cycle.startDate)} - {formatDate(cycle.endDate)}</small>
                                </span>
                                <b>{presentCount}/{cycle.packageClasses || 0}</b>
                              </button>
                              {isOpen && (
                                <div className="subscription-history-records">
                                  {records.length ? records.map((record) => {
                                    const isCurrentRecord = isCurrentSubscriptionAttendanceRecord(record);
                                    return (
                                      <div className={`student-history-row${isCurrentRecord ? ' is-current-subscription' : ''} attendance-history-${record.status}`} key={record._id}>
                                        <span>{new Date(record.date).toLocaleDateString()}</span>
                                        <strong>{record.status}</strong>
                                        <span>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}</span>
                                        <div className="student-history-actions">
                                          {editingAttendanceHistoryId === record._id ? (
                                            <>
                                              <button type="button" className="btn-present compact" onClick={() => handleAttendanceHistoryStatusChange(record, 'present')} disabled={pendingAttendanceHistoryId === record._id}>{pendingAttendanceHistoryId === record._id ? 'Saving...' : 'Present'}</button>
                                              <button type="button" className="btn-absent compact" onClick={() => handleAttendanceHistoryStatusChange(record, 'absent')} disabled={pendingAttendanceHistoryId === record._id}>Absent</button>
                                              <button type="button" className="btn-secondary compact" onClick={() => handleAttendanceHistoryCancel(record)} disabled={pendingAttendanceHistoryId === record._id}>Delete</button>
                                              {isCurrentRecord ? (
                                                <button type="button" className="btn-secondary compact" onClick={() => handleRemoveAttendanceFromCurrentSubscription(record)} disabled={pendingAttendanceHistoryId === record._id}>Remove from current sub</button>
                                              ) : (
                                                <button type="button" className="btn-secondary compact" onClick={() => handleCountAttendanceInCurrentSubscription(record)} disabled={pendingAttendanceHistoryId === record._id}>Count in current sub</button>
                                              )}
                                              <button type="button" className="btn-secondary compact" onClick={() => setEditingAttendanceHistoryId(null)} disabled={pendingAttendanceHistoryId === record._id}>Cancel</button>
                                            </>
                                          ) : (
                                            <button type="button" className="btn-secondary compact" onClick={() => setEditingAttendanceHistoryId(record._id)} disabled={Boolean(pendingAttendanceHistoryId)}>Edit</button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }) : <p className="empty-state">No attendance records in this subscription.</p>}
                                </div>
                              )}
                            </div>
                          );
                        }) : <p className="empty-state">No subscription history found.</p>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {showUnsavedExitConfirm && (
          <div className="student-modal-backdrop unsaved-exit-backdrop" role="presentation" onClick={() => setShowUnsavedExitConfirm(false)}>
            <section className="unsaved-exit-dialog" role="dialog" aria-modal="true" aria-label="Unsaved changes" onClick={(event) => event.stopPropagation()}>
              <div>
                <h2>Unsaved changes</h2>
                <p>You have edits that have not been saved yet. Choose how you would like to continue.</p>
              </div>
              <div className="unsaved-exit-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowUnsavedExitConfirm(false)}>Keep editing</button>
                <button type="button" className="btn-secondary" onClick={() => closeSelectedPlayer({ force: true })}>Exit without saving</button>
                <button type="button" className="btn-primary" onClick={() => handleSaveSelectedPlayerEdit(null, { closeAfterSave: true })}>Save and exit</button>
              </div>
            </section>
          </div>
        )}

        {pendingFrozenVisibilitySave && (
          <div className="student-modal-backdrop unsaved-exit-backdrop" role="presentation">
            <section className="frozen-visibility-dialog" role="dialog" aria-modal="true" aria-label="Frozen attendance visibility" onClick={(event) => event.stopPropagation()}>
              <div className="frozen-visibility-icon">Frozen</div>
              <div>
                <h2>Where should this frozen player appear?</h2>
                <p>Choose whether the player stays on the attendance board for quick check-in, or moves only to the Frozen list.</p>
              </div>
              <label className="frozen-note-field">
                <span>Freeze note</span>
                <textarea
                  value={selectedPlayerForm?.freezeNote || ''}
                  onChange={(event) => {
                    selectedPlayerFormDirtyRef.current = true;
                    setSelectedPlayerForm((current) => ({ ...current, freezeNote: event.target.value }));
                  }}
                  placeholder="Write a private note for this freeze..."
                />
              </label>
              <div className="frozen-visibility-options">
                <button
                  type="button"
                  className="frozen-visibility-option keep-visible"
                  onClick={() => handleSaveSelectedPlayerEdit(null, {
                    closeAfterSave: pendingFrozenVisibilitySave.closeAfterSave,
                    showInAttendanceWhenFrozen: true
                  })}
                >
                  <span>Keep on attendance</span>
                  <small>Visible in the group board with a frozen badge.</small>
                </button>
                <button
                  type="button"
                  className="frozen-visibility-option frozen-only"
                  onClick={() => handleSaveSelectedPlayerEdit(null, {
                    closeAfterSave: pendingFrozenVisibilitySave.closeAfterSave,
                    showInAttendanceWhenFrozen: false
                  })}
                >
                  <span>Frozen list only</span>
                  <small>Hide from attendance and keep under Frozen.</small>
                </button>
              </div>
              <div className="unsaved-exit-actions">
                <button type="button" className="btn-secondary" onClick={() => setPendingFrozenVisibilitySave(null)}>Back to edit</button>
              </div>
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
                      onChange={(event) => handleSubscriptionStartDateChange(event.target.value)}
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
                <div className="subscription-schedule-box">
                  <div className="subscription-schedule-toggle">
                    <button
                      type="button"
                      className={subscriptionForm.scheduleMode === 'auto' ? 'is-active' : ''}
                      onClick={() => handleSubscriptionScheduleModeChange('auto')}
                    >
                      Auto from groups
                    </button>
                    <button
                      type="button"
                      className={subscriptionForm.scheduleMode === 'custom' ? 'is-active' : ''}
                      onClick={() => handleSubscriptionScheduleModeChange('custom')}
                    >
                      Custom days
                    </button>
                  </div>
                  {subscriptionForm.scheduleMode === 'custom' && (
                    <div className="subscription-custom-schedule">
                      <label>
                        <span>Classes</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={subscriptionForm.customClasses}
                          onChange={(event) => handleSubscriptionCustomClassesChange(event.target.value)}
                          placeholder="8"
                        />
                      </label>
                      <div className="subscription-day-picker" aria-label="Subscription days">
                        {[
                          ['Sun', 0],
                          ['Mon', 1],
                          ['Tue', 2],
                          ['Wed', 3],
                          ['Thu', 4],
                          ['Fri', 5],
                          ['Sat', 6]
                        ].map(([label, dayIndex]) => (
                          <button
                            key={dayIndex}
                            type="button"
                            className={subscriptionForm.customDays.includes(dayIndex) ? 'is-active' : ''}
                            onClick={() => handleSubscriptionCustomDayToggle(dayIndex)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
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
