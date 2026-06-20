const TrainingGroup = require('../models/TrainingGroup');
const Player = require('../models/Player');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { decrypt } = require('../utils/encryption');
const { parseLocalizedNumber } = require('../utils/numberInput');

const defaultGroupColors = ['#2563eb', '#f2c94c', '#16a34a', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899'];
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const decodeGroupName = (value) => String(value || '')
  .replace(/&amp;amp;#x2F;/g, '/')
  .replace(/&amp;#x2F;/g, '/')
  .replace(/&#x2F;/g, '/')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

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
      const hasValidColor = hexColorPattern.test(group.color || '');
      const hasValidOrder = Number.isFinite(group.displayOrder) && group.displayOrder > 0;
      const needsNameUpdate = normalizedName !== group.name;

      if (hasValidColor && hasValidOrder && !needsNameUpdate) {
        return null;
      }

      return {
        updateOne: {
          filter: { _id: group._id },
          update: {
            $set: {
              name: normalizedName,
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
    { $match: { isDeleted: { $ne: true } } },
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

const formatPlayerResponse = (player) => {
  const obj = player.toObject({ virtuals: true });
  if (obj.parentPhoneEncrypted) {
    try {
      obj.parentPhone = decrypt(obj.parentPhoneEncrypted);
    } catch (err) {
      obj.parentPhone = '';
    }
  }
  delete obj.parentPhoneEncrypted;
  return obj;
};

const getGroups = async (req, res, next) => {
  try {
    await ensureGroupPresentationFields();
    await synchronizeGroupCounts();
    const groups = await TrainingGroup.find().sort({ displayOrder: 1, _id: -1 }).populate('coachId', 'name');
    res.json(groups);
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
    res.status(201).json(group);
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
    res.json(group);
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
    res.json(groups);
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
      $or: [{ groupId: id }, { groupIds: id }]
    })
      .sort({ createdAt: -1, _id: -1 })
      .populate('parentId', 'name email')
      .populate('programId', 'name')
      .populate('groupId', 'name days startTime endTime')
      .populate('groupIds', 'name days startTime endTime')
      .populate('coachId', 'name')
      .populate('subscriptionId', 'type status remainingSessions usedSessions startDate endDate price');
    res.json(players.map(formatPlayerResponse));
  } catch (error) {
    next(error);
  }
};

module.exports = { getGroups, createGroup, updateGroup, deleteGroup, getGroupPlayers, reorderGroups };
