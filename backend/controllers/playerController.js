const Player = require('../models/Player');
const Parent = require('../models/Parent');
const TrainingGroup = require('../models/TrainingGroup');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
require('../models/Program');
require('../models/Coach');
const { sanitizeObject, decodeText, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { parseLocalizedNumber } = require('../utils/numberInput');
const { snapshotPlayerDocument, createHistoryEntry } = require('../utils/history');
const { synchronizeSubscriptionAttendanceUsage } = require('../utils/subscriptionAttendance');
const { getAppDateKey, getAppDateOnly } = require('../utils/appDate');
const { getCurrentSubscriptionStart, isLaterSubscriptionStart } = require('../utils/subscriptionCycle');

const formatPlayerResponse = (player) => {
  const obj = player.toObject({ virtuals: true });
  if (obj.parentPhoneEncrypted) {
    try {
      obj.parentPhone = decrypt(obj.parentPhoneEncrypted);
    } catch (err) {
      obj.parentPhone = '';
    }
  }
  if (!obj.parentPhone && obj.parentId?.phoneEncrypted) {
    try {
      obj.parentPhone = decrypt(obj.parentId.phoneEncrypted);
    } catch (err) {
      obj.parentPhone = '';
    }
  }
  if ((!obj.groupIds || obj.groupIds.length === 0) && obj.groupId) {
    obj.groupIds = [obj.groupId];
  }
  obj.note = decodeText(obj.note || '');
  obj.makeupClassesNote = decodeText(obj.makeupClassesNote || '');
  obj.freezeNote = decodeText(obj.freezeNote || '');
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

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPaginationOptions = (query) => {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 0, 0), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { limit, page, skip: limit ? (page - 1) * limit : 0 };
};

const getPlayerGroupIds = (player) => {
  if (player.groupIds?.length) {
    return normalizeGroupIds({ groupIds: player.groupIds.map(String) });
  }

  return normalizeGroupIds({ groupId: player.groupId ? String(player.groupId) : '' });
};

const isSubscriptionPaymentType = (value) => ['full payment', 'partial payment'].includes(String(value || '').trim().toLowerCase());

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
    payload.dateOfBirth = null;
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
  if (payload.dueAdjustment === '') {
    payload.dueAdjustment = 0;
  }
  if (payload.previousDueBalance === '') {
    payload.previousDueBalance = 0;
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
  const totalAmount = Number(player.previousDueBalance || 0)
    + Number(player.payment || 0)
    - Number(player.dueAdjustment || 0);
  const subscriptionStart = getDateAtStartOfDay(getPlayerCycleStart(player));
  let runningPaid = 0;

  for (const payment of payments) {
    const paymentDate = getDateAtStartOfDay(payment.paymentDate);
    const createdAt = getDateAtStartOfDay(payment.createdAt);
    const belongsToCurrentSubscription = !subscriptionStart
      || (paymentDate && paymentDate >= subscriptionStart)
      || (createdAt && createdAt >= subscriptionStart);
    if (!belongsToCurrentSubscription) {
      continue;
    }
    if (isSubscriptionPaymentType(payment.transactionType)) {
      runningPaid += Number(payment.paidAmount || 0);
      payment.totalAmount = totalAmount;
      payment.remainingAmount = totalAmount ? Math.max(0, totalAmount - runningPaid) : 0;
    } else {
      payment.totalAmount = 0;
      payment.remainingAmount = 0;
    }
    await payment.save();
  }
};

const getPlayerCycleStart = (player) => getCurrentSubscriptionStart(player);

const getPlayerRemainingAmount = async (player) => {
  if (!player.attendanceDueManual) return 0;
  return Number(player.previousDueBalance || 0) - Number(player.dueAdjustment || 0);
};

const getDateAtStartOfDay = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return getAppDateOnly(date);
};

const synchronizeLinkedSubscription = async (player, startsNewSubscription = false) => {
  if (!player.subscriptionId) return;
  const subscriptionId = player.subscriptionId?._id || player.subscriptionId;
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) return;

  subscription.packageName = player.packageName ?? subscription.packageName;
  subscription.startDate = getCurrentSubscriptionStart(player, subscription.startDate) || subscription.startDate;
  subscription.endDate = player.endDate || subscription.endDate;
  subscription.price = Math.max(0, Number(player.payment ?? subscription.price ?? 0));

  if (subscription.type === 'sessions') {
    subscription.totalSessions = Math.max(0, Number(player.packageClasses ?? subscription.totalSessions ?? 0));
    if (startsNewSubscription) subscription.usedSessions = 0;
    subscription.remainingSessions = Math.max(0, subscription.totalSessions - Number(subscription.usedSessions || 0));
  }

  const endDateKey = subscription.endDate ? getAppDateKey(subscription.endDate) : '';
  const todayKey = getAppDateKey();
  const exhausted = subscription.type === 'sessions'
    && subscription.totalSessions > 0
    && subscription.remainingSessions === 0;
  if ((endDateKey && endDateKey <= todayKey) || exhausted) {
    subscription.status = 'expired';
  } else if (subscription.type === 'sessions' && subscription.totalSessions > 0 && subscription.remainingSessions <= 2) {
    subscription.status = 'almost_expired';
  } else {
    subscription.status = 'active';
  }
  await subscription.save();
};

const reconcileLinkedSubscriptions = async () => {
  const players = await Player.find({
    isDeleted: { $ne: true },
    subscriptionId: { $ne: null }
  });
  const batchSize = 20;
  for (let index = 0; index < players.length; index += batchSize) {
    await Promise.all(players.slice(index, index + batchSize).map(async (player) => {
      if (player.subscriptionId) {
        await synchronizeLinkedSubscription(player);
        await synchronizeSubscriptionAttendanceUsage(player);
      }
    }));
  }
  return players.length;
};

const getPlayers = async (req, res, next) => {
  try {
    const filter = { isDeleted: { $ne: true } };
    const compact = req.query.compact === 'true';
    if (req.parentScope) filter._id = { $in: req.parentScope.playerIds };
    if (req.query.parentId && validateObjectId(req.query.parentId)) {
      filter.parentId = req.query.parentId;
    }
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    if (req.query.groupId && req.query.groupId !== 'all' && validateObjectId(req.query.groupId)) {
      filter.$or = [{ groupId: req.query.groupId }, { groupIds: req.query.groupId }];
    }
    if (req.query.subscription && req.query.subscription !== 'all') {
      if (req.query.subscription === 'none') {
        filter.$and = [
          ...(filter.$and || []),
          { $or: [{ packageName: { $in: ['', null] } }, { packageName: { $exists: false } }] }
        ];
      } else {
        filter.packageName = req.query.subscription;
      }
    }
    if (req.query.search) {
      filter.fullName = new RegExp(escapeRegex(req.query.search), 'i');
    }

    const { limit, page, skip } = getPaginationOptions(req.query);
    const query = Player.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .select(compact
        ? '_id fullName status parentId parentPhoneEncrypted groupId groupIds packageName packageClasses packageHours payment previousDueBalance dueAdjustment attendanceDueManual startDate currentSubscriptionStartedAt subscriptionId'
        : undefined)
      .populate('parentId', compact ? 'name phoneEncrypted' : 'name email userId phoneEncrypted')
      .populate('programId', compact ? 'name' : 'name level')
      .populate('groupId', compact ? 'name' : 'name days startTime endTime')
      .populate('groupIds', compact ? 'name' : 'name days startTime endTime')
      .populate('coachId', 'name');

    if (limit) query.skip(skip).limit(limit);
    const [players, total] = await Promise.all([
      query,
      limit ? Player.countDocuments(filter) : Promise.resolve(null)
    ]);
    if (limit) {
      return res.json({
        items: players.map(formatPlayerResponse),
        total,
        page,
        limit,
        hasMore: skip + players.length < total
      });
    }
    res.json(players.map(formatPlayerResponse));
  } catch (error) {
    next(error);
  }
};

const loadPlayerForHistory = (playerId) => Player.findById(playerId)
  .populate('parentId', 'name email userId phoneEncrypted')
  .populate('programId', 'name level')
  .populate('groupId', 'name days startTime endTime')
  .populate('groupIds', 'name days startTime endTime')
  .populate('coachId', 'name')
  .populate('subscriptionId', 'type status totalSessions remainingSessions usedSessions startDate endDate price');

const createPlayer = async (req, res, next) => {
  try {
    const data = cleanPlayerPayload(sanitizeObject(req.body));
    const groupIds = normalizeGroupIds(data);
    const { fullName, dateOfBirth, parentId, parentPhone, programId, coachId, level, startDate, endDate, packageName, packageClasses, packageHours, payment, previousDueBalance, dueAdjustment, attendanceDueManual, subscriptionNeedsAttention, note, makeupClassesNote, profileImage, status = 'active' } = data;
    if (!fullName || !parentId) {
      return res.status(400).json({ message: 'Required player fields are missing.' });
    }
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }

    const existingPlayer = await Player.findOne({
      parentId,
      fullName: new RegExp(`^${escapeRegex(fullName.trim())}$`, 'i'),
      isDeleted: { $ne: true }
    });
    if (existingPlayer) {
      return res.status(409).json({ message: 'This player is already added for this parent.' });
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
      previousDueBalance: typeof previousDueBalance !== 'undefined' ? parseLocalizedNumber(previousDueBalance) : 0,
      dueAdjustment: typeof dueAdjustment !== 'undefined' ? parseLocalizedNumber(dueAdjustment) : 0,
      attendanceDueManual: Boolean(attendanceDueManual),
      subscriptionNeedsAttention: Boolean(subscriptionNeedsAttention),
      note: note || '',
      makeupClassesNote: makeupClassesNote || '',
      status,
      profileImage: profileImage || ''
    };

    const player = await Player.create(payload);
    await incrementGroups(groupIds, status === 'left' ? 0 : 1);
    await Parent.updateOne({ _id: parent._id }, { $addToSet: { children: player._id } });
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
    const responsePlayer = await loadPlayerForHistory(player._id);
    res.status(201).json(formatPlayerResponse(responsePlayer));
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
      .populate('parentId', 'name email userId phoneEncrypted')
      .populate('programId', 'name level')
      .populate('groupId', 'name days startTime endTime')
      .populate('groupIds', 'name days startTime endTime')
      .populate('coachId', 'name')
      .populate('subscriptionId', 'type status totalSessions remainingSessions usedSessions startDate endDate price');
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const playerData = formatPlayerResponse(player);
    playerData.paymentRemainingAmount = await getPlayerRemainingAmount(player);
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
    const expectedVersion = updates.expectedVersion;
    for (const key of ['expectedVersion', '__v', '_id', 'createdAt', 'isDeleted', 'deletedAt']) delete updates[key];
    const requestedNewSubscription = Boolean(updates.newSubscription);
    delete updates.newSubscription;
    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const startsNewSubscription = requestedNewSubscription
      || isLaterSubscriptionStart(updates.startDate, player);
    if (expectedVersion !== undefined && Number(expectedVersion) !== Number(player.__v || 0)) {
      return res.status(409).json({ message: 'This player changed while you were editing. Refresh before saving again.' });
    }
    const beforePlayer = await loadPlayerForHistory(id);
    const beforeSnapshot = snapshotPlayerDocument(beforePlayer);

    const relatedUpdates = [];

    if (updates.parentId && String(updates.parentId) !== String(player.parentId)) {
      const newParent = await Parent.findById(updates.parentId);
      if (!newParent) {
        return res.status(404).json({ message: 'New parent not found.' });
      }
      const oldParentId = player.parentId;
      relatedUpdates.push(async () => {
        await Parent.updateOne({ _id: oldParentId }, { $pull: { children: player._id } });
        await Parent.updateOne({ _id: newParent._id }, { $addToSet: { children: player._id } });
      });
    }

    if (Array.isArray(updates.groupIds) || typeof updates.groupId !== 'undefined' || updates.status !== undefined) {
      const groupChange = Array.isArray(updates.groupIds) || typeof updates.groupId !== 'undefined';
      const membershipIds = groupChange ? normalizeGroupIds(updates) : getPlayerGroupIds(player);
      const nextGroupIds = (updates.status || player.status) === 'left' ? [] : membershipIds;
      const currentGroupIds = player.status === 'left' ? [] : getPlayerGroupIds(player);
      const addedGroupIds = nextGroupIds.filter((groupId) => !currentGroupIds.includes(groupId));
      const removedGroupIds = currentGroupIds.filter((groupId) => !nextGroupIds.includes(groupId));

      await validateGroupsHaveCapacity(addedGroupIds, 'One or more new groups were not found.', 'is full.');
      relatedUpdates.push(async () => {
        await incrementGroups(addedGroupIds, 1);
        await incrementGroups(removedGroupIds, -1);
      });

      updates.groupIds = membershipIds;
      updates.groupId = membershipIds[0] || undefined;
    }
    if (updates.parentPhone) {
      updates.parentPhoneEncrypted = encrypt(updates.parentPhone);
      delete updates.parentPhone;
    }
    if (typeof updates.payment !== 'undefined') {
      updates.payment = parseLocalizedNumber(updates.payment);
    }
    if (typeof updates.previousDueBalance !== 'undefined') {
      updates.previousDueBalance = parseLocalizedNumber(updates.previousDueBalance);
      updates.attendanceDueManual = true;
    }
    if (typeof updates.dueAdjustment !== 'undefined') {
      updates.dueAdjustment = Math.max(0, parseLocalizedNumber(updates.dueAdjustment));
    }
    if (typeof updates.packageClasses !== 'undefined') {
      updates.packageClasses = parseLocalizedNumber(updates.packageClasses);
    }
    if (typeof updates.packageHours !== 'undefined') {
      updates.packageHours = parseLocalizedNumber(updates.packageHours);
    }
    if (updates.status && updates.status !== 'frozen') {
      updates.showInAttendanceWhenFrozen = true;
      updates.freezeNote = '';
    }
    if (startsNewSubscription) {
      updates.currentSubscriptionStartedAt = getDateAtStartOfDay(updates.startDate) || new Date();
      updates.currentSubscriptionAttendanceIds = [];
      updates.currentSubscriptionExcludedAttendanceIds = [];
    }
    Object.assign(player, updates);
    await player.save();
    for (const updateRelated of relatedUpdates) await updateRelated();
    if (
      startsNewSubscription
      || typeof updates.startDate !== 'undefined'
      || typeof updates.endDate !== 'undefined'
      || typeof updates.packageName !== 'undefined'
      || typeof updates.packageClasses !== 'undefined'
      || typeof updates.payment !== 'undefined'
      || typeof updates.currentSubscriptionStartedAt !== 'undefined'
    ) {
      await synchronizeLinkedSubscription(player, startsNewSubscription);
    }
    if (
      startsNewSubscription
      || typeof updates.startDate !== 'undefined'
      || typeof updates.endDate !== 'undefined'
      || typeof updates.packageClasses !== 'undefined'
      || typeof updates.currentSubscriptionStartedAt !== 'undefined'
      || typeof updates.currentSubscriptionAttendanceIds !== 'undefined'
      || typeof updates.currentSubscriptionExcludedAttendanceIds !== 'undefined'
    ) {
      try {
        await synchronizeSubscriptionAttendanceUsage(player);
      } catch (error) {
        console.error('Player subscription attendance synchronization failed:', error);
      }
    }
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
    const responsePlayer = formatPlayerResponse(afterPlayer);
    responsePlayer.paymentRemainingAmount = await getPlayerRemainingAmount(afterPlayer);
    res.json(responsePlayer);
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

const getPlayerAlertCandidates = async (req, res, next) => {
  try {
    const players = await Player.find({ isDeleted: { $ne: true }, status: { $ne: 'left' }, $or: [{ endDate: { $ne: null } }, { dateOfBirth: { $ne: null } }] })
      .select('_id fullName status endDate dateOfBirth').lean();
    res.json(players);
  } catch (error) {
    next(error);
  }
};

module.exports = { getPlayers, createPlayer, getPlayerById, updatePlayer, deletePlayer, getPlayerAlertCandidates, reconcileLinkedSubscriptions };
