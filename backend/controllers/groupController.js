const TrainingGroup = require('../models/TrainingGroup');
const Player = require('../models/Player');
require('../models/Parent');
const Attendance = require('../models/Attendance');
const { sanitizeObject, decodeText, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { decrypt } = require('../utils/encryption');
const { parseLocalizedNumber } = require('../utils/numberInput');

const defaultGroupColors = ['#2563eb', '#f2c94c', '#16a34a', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899'];
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const groupMaintenanceIntervalMs = 60 * 1000;
let groupMaintenancePromise = null;
let lastGroupMaintenanceAt = 0;

const decodeGroupName = (value) => String(value || '')
  .replace(/&amp;amp;#x2F;/g, '/')
  .replace(/&amp;#x2F;/g, '/')
  .replace(/&#x2F;/g, '/')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const dayNames = new Set([
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'sun', 'mon', 'tue', 'tues', 'wed', 'thu', 'thurs', 'fri', 'sat'
]);

const normalizeGroupDays = (days = []) => [...new Set((Array.isArray(days) ? days : [days])
  .flatMap((day) => String(day || '').split(/[\/,|]+/))
  .map((day) => decodeGroupName(day).trim())
  .filter((day) => {
    const normalized = day.toLowerCase();
    return day && day.length <= 12 && !/\d|:|-/.test(day) && dayNames.has(normalized);
  }))];

const formatGroupResponse = (group) => {
  const obj = group.toObject ? group.toObject({ virtuals: true }) : group;
  return {
    ...obj,
    name: decodeGroupName(obj.name),
    days: normalizeGroupDays(obj.days)
  };
};

const getDateOnly = (value) => {
  const date = value ? new Date(value) : new Date(0);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getCurrentSubscriptionStart = (player) => {
  const rawDate = player.currentSubscriptionStartedAt || player.startDate || player.subscriptionId?.startDate;
  if (!rawDate) return null;
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeGroupPayload = (payload) => {
  const normalized = {
    ...payload,
    maxCapacity: payload.maxCapacity === undefined ? payload.maxCapacity : parseLocalizedNumber(payload.maxCapacity)
  };

  if (payload.displayOrder !== undefined) {
    normalized.displayOrder = Math.max(0, parseLocalizedNumber(payload.displayOrder));
  }

  if (payload.color !== undefined) {
    normalized.color = hexColorPattern.test(payload.color) ? payload.color.toLowerCase() : '#2563eb';
  }

  return normalized;
};

const ensureGroupPresentationFields = async () => {
  const groups = await TrainingGroup.find().sort({ _id: -1 });
  const updates = groups
    .map((group, index) => {
      const normalizedName = decodeGroupName(group.name);
      const normalizedDays = normalizeGroupDays(group.days);
      const hasValidColor = hexColorPattern.test(group.color || '');
      const hasValidOrder = Number.isFinite(group.displayOrder) && group.displayOrder > 0;
      const needsNameUpdate = normalizedName !== group.name;
      const needsDaysUpdate = JSON.stringify(normalizedDays) !== JSON.stringify(group.days || []);

      if (hasValidColor && hasValidOrder && !needsNameUpdate && !needsDaysUpdate) {
        return null;
      }

      return {
        updateOne: {
          filter: { _id: group._id },
          update: {
            $set: {
              name: normalizedName,
              days: normalizedDays,
              color: hasValidColor ? group.color.toLowerCase() : defaultGroupColors[index % defaultGroupColors.length],
              displayOrder: hasValidOrder ? group.displayOrder : index + 1
            }
          }
        }
      };
    })
    .filter(Boolean);

  if (updates.length) {
    await TrainingGroup.bulkWrite(updates);
  }
};

const synchronizeGroupCounts = async () => {
  const counts = await Player.aggregate([
    { $match: { isDeleted: { $ne: true }, status: { $ne: 'left' } } },
    {
      $project: {
        groupIds: {
          $setUnion: [
            { $ifNull: ['$groupIds', []] },
            {
              $cond: [
                { $ne: [{ $ifNull: ['$groupId', null] }, null] },
                ['$groupId'],
                []
              ]
            }
          ]
        }
      }
    },
    { $unwind: '$groupIds' },
    { $group: { _id: '$groupIds', currentCount: { $sum: 1 } } }
  ]);
  const countByGroupId = new Map(counts.map(({ _id, currentCount }) => [String(_id), currentCount]));
  const groups = await TrainingGroup.find({}, '_id currentCount');
  const updates = groups
    .filter((group) => group.currentCount !== (countByGroupId.get(String(group._id)) || 0))
    .map((group) => ({
      updateOne: {
        filter: { _id: group._id },
        update: { $set: { currentCount: countByGroupId.get(String(group._id)) || 0 } }
      }
    }));

  if (updates.length) {
    await TrainingGroup.bulkWrite(updates);
  }
};

const scheduleGroupMaintenance = () => {
  const now = Date.now();
  if (groupMaintenancePromise || (now - lastGroupMaintenanceAt) < groupMaintenanceIntervalMs) {
    return;
  }

  groupMaintenancePromise = new Promise((resolve) => setTimeout(resolve, 1000))
    .then(async () => {
      await ensureGroupPresentationFields();
      await synchronizeGroupCounts();
      lastGroupMaintenanceAt = Date.now();
    })
    .catch((error) => console.error('Group maintenance failed:', error))
    .finally(() => {
      groupMaintenancePromise = null;
    });
};

const formatPlayerResponse = (player) => {
  const obj = player.toObject({ virtuals: true });
  if (obj.groupId && typeof obj.groupId === 'object') {
    obj.groupId = formatGroupResponse(obj.groupId);
  }
  if (Array.isArray(obj.groupIds)) {
    obj.groupIds = obj.groupIds.map((group) => (
      group && typeof group === 'object' ? formatGroupResponse(group) : group
    ));
  }
  if (obj.parentPhoneEncrypted) {
    try {
      obj.parentPhone = decrypt(obj.parentPhoneEncrypted);
    } catch (err) {
      obj.parentPhone = '';
    }
  }
  obj.note = decodeText(obj.note || '');
  delete obj.parentPhoneEncrypted;
  return obj;
};

const getGroups = async (req, res, next) => {
  try {
    scheduleGroupMaintenance();
    const groups = await TrainingGroup.find().sort({ displayOrder: 1, _id: -1 }).populate('coachId', 'name');
    res.json(groups.map(formatGroupResponse));
  } catch (error) {
    next(error);
  }
};

const createGroup = async (req, res, next) => {
  try {
    const payload = normalizeGroupPayload(sanitizeObject(req.body));
    const lastGroup = await TrainingGroup.findOne().sort({ displayOrder: -1, _id: -1 });
    payload.displayOrder = payload.displayOrder > 0 ? payload.displayOrder : (lastGroup?.displayOrder || 0) + 1;
    payload.color = hexColorPattern.test(payload.color || '') ? payload.color : defaultGroupColors[(payload.displayOrder - 1) % defaultGroupColors.length];
    const group = await TrainingGroup.create(payload);
    await createAuditLog({ userId: req.user._id, action: 'create group', entity: 'TrainingGroup', entityId: group._id, req });
    res.status(201).json(formatGroupResponse(group));
  } catch (error) {
    next(error);
  }
};

const updateGroup = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid group ID.' });
    }
    const payload = normalizeGroupPayload(sanitizeObject(req.body));
    const group = await TrainingGroup.findByIdAndUpdate(id, payload, { new: true });
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }
    await createAuditLog({ userId: req.user._id, action: 'update group', entity: 'TrainingGroup', entityId: group._id, req });
    res.json(formatGroupResponse(group));
  } catch (error) {
    next(error);
  }
};

const reorderGroups = async (req, res, next) => {
  try {
    const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds : [];

    if (!groupIds.length) {
      return res.status(400).json({ message: 'Group order is required.' });
    }

    const invalidId = groupIds.find((groupId) => !validateObjectId(groupId));
    if (invalidId) {
      return res.status(400).json({ message: 'Invalid group ID in order payload.' });
    }

    await TrainingGroup.bulkWrite(
      groupIds.map((groupId, index) => ({
        updateOne: {
          filter: { _id: groupId },
          update: { $set: { displayOrder: index + 1 } }
        }
      }))
    );

    await createAuditLog({ userId: req.user._id, action: 'reorder groups', entity: 'TrainingGroup', req });
    const groups = await TrainingGroup.find().sort({ displayOrder: 1, _id: -1 }).populate('coachId', 'name');
    res.json(groups.map(formatGroupResponse));
  } catch (error) {
    next(error);
  }
};

const deleteGroup = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid group ID.' });
    }
    const group = await TrainingGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }
    const playerCount = await Player.countDocuments({
      isDeleted: { $ne: true },
      $or: [{ groupId: group._id }, { groupIds: group._id }]
    });
    if (playerCount > 0) {
      return res.status(400).json({ message: 'Cannot delete group with assigned players.' });
    }
    await group.deleteOne();
    await createAuditLog({ userId: req.user._id, action: 'delete group', entity: 'TrainingGroup', entityId: group._id, req });
    res.json({ message: 'Group deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const getGroupPlayers = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid group ID.' });
    }
    const players = await Player.find({
      isDeleted: { $ne: true },
      status: { $ne: 'left' },
      $and: [
        {
          $or: [
            { status: { $ne: 'frozen' } },
            { showInAttendanceWhenFrozen: { $ne: false } }
          ]
        }
      ],
      $or: [{ groupId: id }, { groupIds: id }]
    })
      .sort({ createdAt: -1, _id: -1 })
      .populate('parentId', 'name email')
      .populate('programId', 'name')
      .populate('groupId', 'name days startTime endTime')
      .populate('groupIds', 'name days startTime endTime')
      .populate('coachId', 'name')
      .populate('subscriptionId', 'type status totalSessions remainingSessions usedSessions startDate endDate price');
    const playerIds = players.map((player) => player._id);
    const cycleStartByPlayerId = new Map(players.map((player) => [
      String(player._id),
      getCurrentSubscriptionStart(player) || new Date(0)
    ]));
    const explicitCurrentRecordIdsByPlayerId = new Map(players.map((player) => [
      String(player._id),
      new Set((player.currentSubscriptionAttendanceIds || []).map(String))
    ]));
    const excludedCurrentRecordIdsByPlayerId = new Map(players.map((player) => [
      String(player._id),
      new Set((player.currentSubscriptionExcludedAttendanceIds || []).map(String))
    ]));
    const presentRecords = playerIds.length
      ? await Attendance.find({
        playerId: { $in: playerIds },
        status: 'present'
      }).select('playerId date checkInTime').lean()
      : [];
    const presentDatesByPlayerId = new Map();

    presentRecords.forEach((record) => {
      const playerId = String(record.playerId);
      const cycleStart = cycleStartByPlayerId.get(playerId);
      const recordDate = getDateOnly(record.date);

      if (excludedCurrentRecordIdsByPlayerId.get(playerId)?.has(String(record._id))) return;

      const isExplicitlyCounted = explicitCurrentRecordIdsByPlayerId.get(playerId)?.has(String(record._id));
      const isInCurrentCycle = !cycleStart || isExplicitlyCounted || recordDate >= getDateOnly(cycleStart);

      if (isInCurrentCycle) {
        if (!presentDatesByPlayerId.has(playerId)) {
          presentDatesByPlayerId.set(playerId, new Set());
        }
        presentDatesByPlayerId.get(playerId).add(recordDate.toISOString().split('T')[0]);
      }
    });

    res.json(players.map((player) => ({
      ...formatPlayerResponse(player),
      attendanceGroupId: id,
      attendancePresentCount: Math.min(
        Number(player.packageClasses || player.subscriptionId?.totalSessions || 0) || Number.MAX_SAFE_INTEGER,
        presentDatesByPlayerId.get(String(player._id))?.size || 0
      ),
      paymentRemainingAmount: player.attendanceDueManual
        ? Number(player.previousDueBalance || 0) - Number(player.dueAdjustment || 0)
        : 0
    })));
  } catch (error) {
    next(error);
  }
};

module.exports = { getGroups, createGroup, updateGroup, deleteGroup, getGroupPlayers, reorderGroups };
