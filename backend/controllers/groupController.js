const TrainingGroup = require('../models/TrainingGroup');
const Player = require('../models/Player');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { decrypt } = require('../utils/encryption');
const { parseLocalizedNumber } = require('../utils/numberInput');

const normalizeGroupPayload = (payload) => ({
  ...payload,
  maxCapacity: payload.maxCapacity === undefined ? payload.maxCapacity : parseLocalizedNumber(payload.maxCapacity)
});

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
    const groups = await TrainingGroup.find().sort({ _id: -1 }).populate('coachId', 'name');
    res.json(groups);
  } catch (error) {
    next(error);
  }
};

const createGroup = async (req, res, next) => {
  try {
    const payload = normalizeGroupPayload(sanitizeObject(req.body));
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

module.exports = { getGroups, createGroup, updateGroup, deleteGroup, getGroupPlayers };
