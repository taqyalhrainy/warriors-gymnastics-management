const Player = require('../models/Player');
const Parent = require('../models/Parent');
const TrainingGroup = require('../models/TrainingGroup');
const Payment = require('../models/Payment');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');

const formatPlayerResponse = (player) => {
  const obj = player.toObject({ virtuals: true });
  if (obj.parentPhoneEncrypted) {
    try {
      obj.parentPhone = decrypt(obj.parentPhoneEncrypted);
    } catch (err) {
      obj.parentPhone = '';
    }
  }
  if ((!obj.groupIds || obj.groupIds.length === 0) && obj.groupId) {
    obj.groupIds = [obj.groupId];
  }
  delete obj.parentPhoneEncrypted;
  return obj;
};

const optionalObjectIdFields = ['programId', 'groupId', 'coachId', 'subscriptionId'];

const normalizeGroupIds = (payload) => {
  const rawGroupIds = Array.isArray(payload.groupIds)
    ? payload.groupIds
    : [payload.groupId].filter(Boolean);
  return [...new Set(rawGroupIds.filter((groupId) => validateObjectId(groupId)).map(String))];
};

const getPlayerGroupIds = (player) => normalizeGroupIds({
  groupIds: player.groupIds?.length ? player.groupIds.map(String) : [],
  groupId: player.groupId ? String(player.groupId) : ''
});

const cleanPlayerPayload = (payload) => {
  optionalObjectIdFields.forEach((field) => {
    if (payload[field] === '') {
      delete payload[field];
    }
  });
  if (Array.isArray(payload.groupIds)) {
    payload.groupIds = normalizeGroupIds(payload);
    payload.groupId = payload.groupIds[0] || undefined;
  }
  if (payload.dateOfBirth === '') {
    delete payload.dateOfBirth;
  }
  if (payload.startDate === '') {
    delete payload.startDate;
  }
  if (payload.endDate === '') {
    delete payload.endDate;
  }
  if (payload.payment === '') {
    payload.payment = 0;
  }
  if (payload.packageClasses === '') {
    payload.packageClasses = 0;
  }
  if (payload.packageHours === '') {
    payload.packageHours = 0;
  }
  return payload;
};

const validateGroupsHaveCapacity = async (groupIds, notFoundMessage, fullMessageSuffix) => {
  if (!groupIds.length) return;

  const groups = await TrainingGroup.find({ _id: { $in: groupIds } });
  if (groups.length !== groupIds.length) {
    const error = new Error(notFoundMessage);
    error.statusCode = 404;
    throw error;
  }

  const fullGroup = groups.find((group) => group.currentCount >= group.maxCapacity);
  if (fullGroup) {
    const error = new Error(`${fullGroup.name} ${fullMessageSuffix}`);
    error.statusCode = 400;
    throw error;
  }
};

const incrementGroups = async (groupIds, amount) => {
  if (!groupIds.length) return;
  await TrainingGroup.updateMany({ _id: { $in: groupIds } }, { $inc: { currentCount: amount } });
  if (amount < 0) {
    await TrainingGroup.updateMany({ _id: { $in: groupIds }, currentCount: { $lt: 0 } }, { $set: { currentCount: 0 } });
  }
};

const getPlayers = async (req, res, next) => {
  try {
    const filter = { isDeleted: { $ne: true } };
    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id });
      if (parent) {
        filter.parentId = parent._id;
      }
    }
    if (req.query.parentId && validateObjectId(req.query.parentId)) {
      filter.parentId = req.query.parentId;
    }
    const players = await Player.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .populate('parentId', 'name email')
      .populate('programId', 'name level')
      .populate('groupId', 'name days startTime endTime')
      .populate('groupIds', 'name days startTime endTime')
      .populate('coachId', 'name');
    res.json(players.map(formatPlayerResponse));
  } catch (error) {
    next(error);
  }
};

const createPlayer = async (req, res, next) => {
  try {
    const data = cleanPlayerPayload(sanitizeObject(req.body));
    const groupIds = normalizeGroupIds(data);
    const { fullName, dateOfBirth, parentId, parentPhone, programId, coachId, level, startDate, endDate, packageName, packageClasses, packageHours, payment, note, profileImage, status = 'active' } = data;
    if (!fullName || !parentId) {
      return res.status(400).json({ message: 'Required player fields are missing.' });
    }
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }

    await validateGroupsHaveCapacity(groupIds, 'One or more groups were not found.', 'is already at full capacity.');

    const payload = {
      fullName,
      dateOfBirth,
      parentId,
      parentPhoneEncrypted: encrypt(parentPhone),
      programId,
      groupId: groupIds[0],
      groupIds,
      coachId,
      level,
      startDate,
      endDate,
      packageName: packageName || '',
      packageClasses: Number(packageClasses || 0),
      packageHours: Number(packageHours || 0),
      payment: Number(payment || 0),
      note: note || '',
      status,
      profileImage: profileImage || ''
    };

    await incrementGroups(groupIds, 1);
    const player = await Player.create(payload);
    parent.children.push(player._id);
    await parent.save();
    await createAuditLog({ userId: req.user._id, action: 'add player', entity: 'Player', entityId: player._id, req });
    res.status(201).json(formatPlayerResponse(player));
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

const getPlayerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const player = await Player.findById(id)
      .populate('parentId', 'name email')
      .populate('programId', 'name level')
      .populate('groupId', 'name days startTime endTime')
      .populate('groupIds', 'name days startTime endTime')
      .populate('coachId', 'name');
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const playerData = formatPlayerResponse(player);
    res.json(playerData);
  } catch (error) {
    next(error);
  }
};

const updatePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const updates = cleanPlayerPayload(sanitizeObject(req.body));
    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }

    if (Array.isArray(updates.groupIds) || typeof updates.groupId !== 'undefined') {
      const nextGroupIds = normalizeGroupIds(updates);
      const currentGroupIds = getPlayerGroupIds(player);
      const addedGroupIds = nextGroupIds.filter((groupId) => !currentGroupIds.includes(groupId));
      const removedGroupIds = currentGroupIds.filter((groupId) => !nextGroupIds.includes(groupId));

      await validateGroupsHaveCapacity(addedGroupIds, 'One or more new groups were not found.', 'is full.');
      await incrementGroups(addedGroupIds, 1);
      await incrementGroups(removedGroupIds, -1);

      updates.groupIds = nextGroupIds;
      updates.groupId = nextGroupIds[0] || undefined;
    }
    if (updates.parentPhone) {
      updates.parentPhoneEncrypted = encrypt(updates.parentPhone);
      delete updates.parentPhone;
    }
    if (typeof updates.payment !== 'undefined') {
      updates.payment = Number(updates.payment || 0);
    }
    if (typeof updates.packageClasses !== 'undefined') {
      updates.packageClasses = Number(updates.packageClasses || 0);
    }
    if (typeof updates.packageHours !== 'undefined') {
      updates.packageHours = Number(updates.packageHours || 0);
    }
    Object.assign(player, updates);
    await player.save();
    await createAuditLog({ userId: req.user._id, action: 'edit player', entity: 'Player', entityId: player._id, req });
    res.json(formatPlayerResponse(player));
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

const deletePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    await incrementGroups(getPlayerGroupIds(player), -1);
    const parent = await Parent.findById(player.parentId);
    if (parent) {
      parent.children = parent.children.filter((childId) => String(childId) !== String(player._id));
      await parent.save();
    }
    await Payment.updateMany(
      { playerId: player._id, playerNameSnapshot: { $in: ['', null] } },
      { $set: { playerNameSnapshot: player.fullName } }
    );
    player.isDeleted = true;
    player.deletedAt = new Date();
    player.status = 'left';
    await player.save();
    await createAuditLog({ userId: req.user._id, action: 'delete player', entity: 'Player', entityId: player._id, req });
    res.json({ message: 'Player deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPlayers, createPlayer, getPlayerById, updatePlayer, deletePlayer };
