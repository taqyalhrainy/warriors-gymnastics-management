const Player = require('../models/Player');
const Parent = require('../models/Parent');
const TrainingGroup = require('../models/TrainingGroup');
const Payment = require('../models/Payment');
const { sanitizeObject, decodeText, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { parseLocalizedNumber } = require('../utils/numberInput');
const { snapshotPlayerDocument, createHistoryEntry } = require('../utils/history');

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
  obj.note = decodeText(obj.note || '');
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

const getPlayerGroupIds = (player) => {
  if (player.groupIds?.length) {
    return normalizeGroupIds({ groupIds: player.groupIds.map(String) });
  }

  return normalizeGroupIds({ groupId: player.groupId ? String(player.groupId) : '' });
};

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

const recalculatePlayerPayments = async (player) => {
  const payments = await Payment.find({ playerId: player._id }).sort({ paymentDate: 1, _id: 1 });
  const totalAmount = Number(player.payment || 0);
  const subscriptionStart = player.startDate ? new Date(player.startDate) : null;
  const subscriptionCycleStart = player.currentSubscriptionStartedAt ? new Date(player.currentSubscriptionStartedAt) : null;
  let runningPaid = 0;

  for (const payment of payments) {
    if (subscriptionCycleStart && (!payment.createdAt || new Date(payment.createdAt) < subscriptionCycleStart)) {
      continue;
    }
    if (!subscriptionCycleStart && subscriptionStart && new Date(payment.paymentDate) < subscriptionStart) {
      continue;
    }
    runningPaid += Number(payment.paidAmount || 0);
    payment.totalAmount = totalAmount;
    payment.remainingAmount = totalAmount ? Math.max(0, totalAmount - runningPaid) : 0;
    await payment.save();
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
      .populate('parentId', 'name email userId')
      .populate('programId', 'name level')
      .populate('groupId', 'name days startTime endTime')
      .populate('groupIds', 'name days startTime endTime')
      .populate('coachId', 'name');
    res.json(players.map(formatPlayerResponse));
  } catch (error) {
    next(error);
  }
};

const loadPlayerForHistory = (playerId) => Player.findById(playerId)
  .populate('parentId', 'name email userId')
  .populate('programId', 'name level')
  .populate('groupId', 'name days startTime endTime')
  .populate('groupIds', 'name days startTime endTime')
  .populate('coachId', 'name')
  .populate('subscriptionId', 'type status totalSessions remainingSessions usedSessions startDate endDate price');

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
      packageClasses: parseLocalizedNumber(packageClasses),
      packageHours: parseLocalizedNumber(packageHours),
      payment: parseLocalizedNumber(payment),
      note: note || '',
      status,
      profileImage: profileImage || ''
    };

    await incrementGroups(groupIds, 1);
    const player = await Player.create(payload);
    parent.children.push(player._id);
    await parent.save();
    const playerForHistory = await loadPlayerForHistory(player._id);
    await createHistoryEntry({
      entityType: 'player',
      entityId: player._id,
      action: 'create',
      after: snapshotPlayerDocument(playerForHistory),
      userId: req.user._id,
      req
    });
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
      .populate('parentId', 'name email userId')
      .populate('programId', 'name level')
      .populate('groupId', 'name days startTime endTime')
      .populate('groupIds', 'name days startTime endTime')
      .populate('coachId', 'name')
      .populate('subscriptionId', 'type status totalSessions remainingSessions usedSessions startDate endDate price');
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
    const startsNewSubscription = Boolean(updates.newSubscription);
    delete updates.newSubscription;
    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const beforePlayer = await loadPlayerForHistory(id);
    const beforeSnapshot = snapshotPlayerDocument(beforePlayer);

    if (updates.parentId && String(updates.parentId) !== String(player.parentId)) {
      const newParent = await Parent.findById(updates.parentId);
      if (!newParent) {
        return res.status(404).json({ message: 'New parent not found.' });
      }
      const oldParent = await Parent.findById(player.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter((childId) => String(childId) !== String(player._id));
        await oldParent.save();
      }
      newParent.children = newParent.children.filter((childId, index, children) => (
        String(childId) !== String(player._id) || children.findIndex((item) => String(item) === String(player._id)) === index
      ));
      if (!newParent.children.some((childId) => String(childId) === String(player._id))) {
        newParent.children.push(player._id);
      }
      await newParent.save();
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
      updates.payment = parseLocalizedNumber(updates.payment);
    }
    if (typeof updates.packageClasses !== 'undefined') {
      updates.packageClasses = parseLocalizedNumber(updates.packageClasses);
    }
    if (typeof updates.packageHours !== 'undefined') {
      updates.packageHours = parseLocalizedNumber(updates.packageHours);
    }
    if (startsNewSubscription) {
      updates.currentSubscriptionStartedAt = new Date();
    }
    Object.assign(player, updates);
    await player.save();
    if (startsNewSubscription || typeof updates.payment !== 'undefined' || typeof updates.startDate !== 'undefined' || typeof updates.currentSubscriptionStartedAt !== 'undefined') {
      await recalculatePlayerPayments(player);
    }
    const afterPlayer = await loadPlayerForHistory(id);
    await createHistoryEntry({
      entityType: 'player',
      entityId: player._id,
      action: 'update',
      before: beforeSnapshot,
      after: snapshotPlayerDocument(afterPlayer),
      userId: req.user._id,
      req
    });
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
    const beforePlayer = await loadPlayerForHistory(id);
    const beforeSnapshot = snapshotPlayerDocument(beforePlayer);
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
    const afterPlayer = await loadPlayerForHistory(id);
    await createHistoryEntry({
      entityType: 'player',
      entityId: player._id,
      action: 'delete',
      before: beforeSnapshot,
      after: snapshotPlayerDocument(afterPlayer),
      userId: req.user._id,
      req
    });
    await createAuditLog({ userId: req.user._id, action: 'delete player', entity: 'Player', entityId: player._id, req });
    res.json({ message: 'Player deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPlayers, createPlayer, getPlayerById, updatePlayer, deletePlayer };
