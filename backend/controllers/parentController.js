const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const HistoryEntry = require('../models/HistoryEntry');
const { sanitizeObject, validateEmail, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');

const isSubscriptionPaymentType = (value) => ['full payment', 'partial payment'].includes(String(value || '').trim().toLowerCase());

const isOnOrAfter = (value, date) => {
  if (!value || !date) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed >= date;
};

const getCurrentSubscriptionStart = (player) => {
  const rawDate = player?.currentSubscriptionStartedAt || player?.startDate || player?.subscriptionId?.startDate;
  if (!rawDate) return null;
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCurrentSubscriptionPaymentMatch = (player) => {
  const match = { playerId: player._id, transactionType: { $in: ['Full payment', 'Partial payment'] } };
  const subscriptionStart = getCurrentSubscriptionStart(player);
  if (subscriptionStart) {
    match.$or = [
      { paymentDate: { $gte: subscriptionStart } },
      { createdAt: { $gte: subscriptionStart } }
    ];
  }
  return match;
};

const getParentVisibleRemaining = (player) => (
  player?.attendanceDueManual
    ? Math.max(0, Number(player.previousDueBalance || 0) - Number(player.dueAdjustment || 0))
    : 0
);

const getDateOnly = (value) => {
  const date = value ? new Date(value) : new Date(0);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const getSubscriptionStartValue = (snapshot, allowInitialFallback = false) => (
  snapshot?.startDate
  || (allowInitialFallback ? (snapshot?.currentSubscriptionStartedAt || snapshot?.createdAt || '') : '')
);

const getSubscriptionHistoryKey = (snapshot, allowInitialFallback = false) => getDateInputValue(getSubscriptionStartValue(snapshot, allowInitialFallback));

const cycleHasPackageDetails = (cycle) => (
  Boolean(cycle.packageName)
  || Number(cycle.packageClasses || 0) > 0
  || Number(cycle.payment || 0) > 0
);

const getSubscriptionCycleIdentity = (cycle) => [
  getDateInputValue(cycle.startDate),
  getDateInputValue(cycle.endDate),
  cycle.packageName || '',
  Number(cycle.packageClasses || 0),
  Number(cycle.packageHours || 0),
  Number(cycle.payment || 0)
].join('|');

const normalizeSubscriptionCycles = (cycles) => {
  const sortedAsc = [...cycles]
    .filter((cycle) => cycle.startDate)
    .sort((first, second) => new Date(first.startDate) - new Date(second.startDate));
  const meaningfulCycles = [];
  const seenCycleIdentities = new Set();

  sortedAsc.forEach((cycle) => {
    const identity = getSubscriptionCycleIdentity(cycle);
    if (seenCycleIdentities.has(identity)) return;
    seenCycleIdentities.add(identity);

    const previous = meaningfulCycles[meaningfulCycles.length - 1];
    const startsInsidePrevious = previous?.endDate
      && getDateOnly(cycle.startDate).getTime() <= getDateOnly(previous.endDate).getTime();

    if (startsInsidePrevious && !cycleHasPackageDetails(cycle)) return;
    meaningfulCycles.push(cycle);
  });

  const mergedByStart = new Map();
  meaningfulCycles.forEach((cycle) => {
    const startKey = getDateInputValue(cycle.startDate);
    const existing = mergedByStart.get(startKey);
    const existingChangedAt = new Date(existing?.changedAt || 0).getTime();
    const cycleChangedAt = new Date(cycle.changedAt || 0).getTime();
    if (!existing || cycleChangedAt >= existingChangedAt || (!cycleHasPackageDetails(existing) && cycleHasPackageDetails(cycle))) {
      mergedByStart.set(startKey, cycle);
    }
  });

  return [...mergedByStart.values()]
    .sort((first, second) => new Date(first.startDate) - new Date(second.startDate));
};

const buildSubscriptionHistory = (entries = [], player = null) => {
  const playerObject = player?.toObject ? player.toObject({ virtuals: true }) : player;
  const sortedEntries = [...entries].sort((first, second) => new Date(first.changedAt) - new Date(second.changedAt));
  const initialEntry = sortedEntries.find((entry) => entry.after && entry.action === 'create');
  const cycles = [];
  const makeCycle = (snapshot, changedAt, allowInitialFallback = false) => {
    const key = getSubscriptionHistoryKey(snapshot, allowInitialFallback);
    if (!snapshot || !key) return null;
    return {
      key,
      changedAt,
      startDate: getSubscriptionStartValue(snapshot, allowInitialFallback),
      endDate: snapshot.endDate,
      packageName: snapshot.packageName || '',
      packageClasses: Number(snapshot.packageClasses || 0),
      packageHours: Number(snapshot.packageHours || 0),
      payment: Number(snapshot.payment || 0)
    };
  };
  const initialCycle = makeCycle(initialEntry?.after || playerObject, initialEntry?.changedAt || new Date().toISOString(), true);
  if (initialCycle) cycles.push(initialCycle);

  sortedEntries.forEach((entry) => {
    if (entry.action === 'create') return;
    const changedFields = entry.changedFields || [];
    const subscriptionFields = ['startDate', 'endDate', 'packageName', 'packageClasses', 'packageHours', 'payment'];
    const isSubscriptionSnapshot = entry.after?.startDate
      && changedFields.some((field) => subscriptionFields.includes(field));
    if (!isSubscriptionSnapshot) return;

    const startsNewSubscription = changedFields.includes('currentSubscriptionStartedAt');
    const nextCycle = makeCycle(entry.after, entry.changedAt);
    if (!nextCycle) return;

    if (startsNewSubscription) {
      const existingIndex = cycles.findIndex((cycle) => cycle.key === nextCycle.key);
      if (existingIndex >= 0) {
        cycles[existingIndex] = nextCycle;
      } else {
        cycles.push(nextCycle);
      }
      return;
    }

    if (cycles.length) {
      cycles[cycles.length - 1] = nextCycle;
    }
  });

  const currentCycle = makeCycle(playerObject, new Date().toISOString(), cycles.length === 0);
  if (currentCycle) {
    const existingIndex = cycles.findIndex((cycle) => cycle.key === currentCycle.key);
    if (existingIndex >= 0) {
      cycles[existingIndex] = currentCycle;
    } else if (!cycles.length) {
      cycles.push(currentCycle);
    }
  }

  return normalizeSubscriptionCycles(cycles)
    .sort((first, second) => new Date(second.startDate) - new Date(first.startDate));
};

const getAttendancePresentCountMap = async (players) => {
  const playerIds = players.map((player) => player._id).filter(Boolean);
  if (!playerIds.length) return new Map();

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
  const presentRecords = await Attendance.find({
    playerId: { $in: playerIds },
    status: 'present'
  }).select('_id playerId date').lean();
  const presentDatesByPlayerId = new Map();

  presentRecords.forEach((record) => {
    const playerId = String(record.playerId);
    if (excludedCurrentRecordIdsByPlayerId.get(playerId)?.has(String(record._id))) return;

    const cycleStart = cycleStartByPlayerId.get(playerId);
    const recordDate = getDateOnly(record.date);
    const isExplicitlyCounted = explicitCurrentRecordIdsByPlayerId.get(playerId)?.has(String(record._id));
    const isInCurrentCycle = !cycleStart || isExplicitlyCounted || recordDate >= getDateOnly(cycleStart);
    if (!isInCurrentCycle) return;

    if (!presentDatesByPlayerId.has(playerId)) {
      presentDatesByPlayerId.set(playerId, new Set());
    }
    presentDatesByPlayerId.get(playerId).add(recordDate.toISOString().split('T')[0]);
  });

  return new Map(players.map((player) => {
    const totalClasses = Number(player.packageClasses || player.subscriptionId?.totalSessions || 0) || Number.MAX_SAFE_INTEGER;
    const presentCount = presentDatesByPlayerId.get(String(player._id))?.size || 0;
    return [String(player._id), Math.min(totalClasses, presentCount)];
  }));
};

const getAttendancePresentCountMapFromRecords = (players, records) => {
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
  const presentDatesByPlayerId = new Map();

  records.forEach((record) => {
    if (record.status !== 'present') return;
    const playerId = String(record.playerId?._id || record.playerId || '');
    if (!playerId || excludedCurrentRecordIdsByPlayerId.get(playerId)?.has(String(record._id))) return;

    const cycleStart = cycleStartByPlayerId.get(playerId);
    const recordDate = getDateOnly(record.date);
    const isExplicitlyCounted = explicitCurrentRecordIdsByPlayerId.get(playerId)?.has(String(record._id));
    const isInCurrentCycle = !cycleStart || isExplicitlyCounted || recordDate >= getDateOnly(cycleStart);
    if (!isInCurrentCycle) return;

    if (!presentDatesByPlayerId.has(playerId)) {
      presentDatesByPlayerId.set(playerId, new Set());
    }
    presentDatesByPlayerId.get(playerId).add(recordDate.toISOString().split('T')[0]);
  });

  return new Map(players.map((player) => {
    const totalClasses = Number(player.packageClasses || player.subscriptionId?.totalSessions || 0) || Number.MAX_SAFE_INTEGER;
    const presentCount = presentDatesByPlayerId.get(String(player._id))?.size || 0;
    return [String(player._id), Math.min(totalClasses, presentCount)];
  }));
};

const getCurrentPaymentSummaryMap = async (players) => {
  const playerIds = players.map((player) => player._id).filter(Boolean);
  if (!playerIds.length) return new Map();

  const playerById = new Map(players.map((player) => [String(player._id), player]));
  const paymentRows = await Payment.find({
    playerId: { $in: playerIds },
    transactionType: { $in: ['Full payment', 'Partial payment'] }
  }).select('playerId paidAmount paymentDate createdAt transactionType').lean();

  const summaryMap = new Map(players.map((player) => {
    const totalAmount = getParentVisibleRemaining(player);
    return [String(player._id), { totalAmount, paidAmount: 0, remainingAmount: Math.max(0, totalAmount) }];
  }));

  paymentRows.forEach((payment) => {
    const playerId = String(payment.playerId);
    const player = playerById.get(playerId);
    const summary = summaryMap.get(playerId);
    if (!player || !summary) return;
    const subscriptionStart = getCurrentSubscriptionStart(player);
    if (subscriptionStart && !isOnOrAfter(payment.paymentDate, subscriptionStart) && !isOnOrAfter(payment.createdAt, subscriptionStart)) return;
    summary.paidAmount += Number(payment.paidAmount || 0);
    summary.remainingAmount = Math.max(0, Number(summary.totalAmount || 0));
  });

  return summaryMap;
};

const formatParentResponse = (parent) => {
  const obj = parent.toObject({ virtuals: true });
  if (obj.phoneEncrypted) {
    try {
      obj.phone = decrypt(obj.phoneEncrypted);
    } catch (err) {
      obj.phone = '';
    }
  }
  delete obj.phoneEncrypted;
  return obj;
};

const getParents = async (req, res, next) => {
  try {
    const parents = await Parent.find()
      .sort({ _id: -1 })
      .populate('userId', 'name email role isActive')
      .populate('children', 'fullName status programId groupId groupIds subscriptionId');
    const childCounts = await Player.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$parentId', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(childCounts.map((item) => [String(item._id), item.count]));
    res.json(parents.map((parent) => ({
      ...formatParentResponse(parent),
      childrenCount: countMap.get(String(parent._id)) || 0
    })));
  } catch (error) {
    next(error);
  }
};

const getParentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid parent ID.' });
    }
    const parent = await Parent.findById(id)
      .populate('userId', 'name email role isActive')
      .populate('children', 'fullName status programId groupId groupIds subscriptionId');
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }
    res.json(formatParentResponse(parent));
  } catch (error) {
    next(error);
  }
};

const createParent = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const { name, password, phone = '', isActive } = body;
    const email = body.email?.toLowerCase().trim();
    if (!name || !password) {
      return res.status(400).json({ message: 'Name and password are required.' });
    }
    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    if (email && await User.findOne({ email })) {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    const existingParentName = await User.findOne({
      role: 'parent',
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });
    if (existingParentName) {
      return res.status(409).json({ message: 'A parent with this name already exists. Please use a unique login name.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const internalEmail = email || `parent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@warriors.local`;
    const user = await User.create({ name, email: internalEmail, passwordHash, role: 'parent', phone, isActive: isActive !== false });
    const parent = await Parent.create({
      userId: user._id,
      name,
      phoneEncrypted: phone ? encrypt(phone) : '',
      email: email || '',
      children: []
    });
    await createAuditLog({ userId: req.user._id, action: 'create parent', entity: 'Parent', entityId: parent._id, req });
    res.status(201).json(formatParentResponse(parent));
  } catch (error) {
    next(error);
  }
};

const updateParent = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid parent ID.' });
    }
    const body = sanitizeObject(req.body);
    const parent = await Parent.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }
    if (body.email && !validateEmail(body.email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    const user = await User.findById(parent.userId);
    if (!user) {
      return res.status(404).json({ message: 'Parent user not found.' });
    }
    if (body.name) {
      user.name = body.name;
      parent.name = body.name;
    }
    if (body.email) {
      user.email = body.email;
      parent.email = body.email;
    }
    if (typeof body.isActive === 'boolean') {
      user.isActive = body.isActive;
    }
    if (typeof body.phone !== 'undefined') {
      user.phone = body.phone;
      parent.phoneEncrypted = body.phone ? encrypt(body.phone) : '';
    }
    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 12);
    }
    await user.save();
    await parent.save();
    await createAuditLog({ userId: req.user._id, action: 'update parent', entity: 'Parent', entityId: parent._id, req });
    res.json(formatParentResponse(parent));
  } catch (error) {
    next(error);
  }
};

const deleteParent = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid parent ID.' });
    }
    const parent = await Parent.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }
    const activeChildrenCount = await Player.countDocuments({ parentId: parent._id, isDeleted: { $ne: true } });
    if (activeChildrenCount > 0) {
      return res.status(400).json({ message: 'Cannot delete a parent with active children.' });
    }
    const user = await User.findById(parent.userId);
    await parent.deleteOne();
    if (user) {
      await user.deleteOne();
    }
    await createAuditLog({ userId: req.user._id, action: 'delete parent', entity: 'Parent', entityId: parent._id, req });
    res.json({ message: 'Parent deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const getParentMe = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id })
      .populate('children', 'fullName status programId groupId groupIds subscriptionId');
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    res.json(formatParentResponse(parent));
  } catch (error) {
    next(error);
  }
};

const getParentChildren = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const children = await Player.find({ parentId: parent._id })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id fullName dateOfBirth profileImage status programId groupId groupIds subscriptionId')
      .populate('programId', 'name level')
      .populate('groupId', 'name')
      .populate('groupIds', 'name')
      .populate('subscriptionId', 'type status remainingSessions startDate endDate price');
    res.json(children);
  } catch (error) {
    next(error);
  }
};

const getParentAttendance = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const children = await Player.find({ parentId: parent._id })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id fullName dateOfBirth profileImage status startDate endDate packageName packageClasses packageHours payment previousDueBalance dueAdjustment attendanceDueManual currentSubscriptionStartedAt currentSubscriptionAttendanceIds currentSubscriptionExcludedAttendanceIds subscriptionId')
      .populate('subscriptionId', 'totalSessions usedSessions remainingSessions startDate endDate status price');
    const childIds = children.map((child) => child._id);
    const attendance = await Attendance.find({ playerId: { $in: childIds } })
      .select('_id playerId groupId date checkInTime status')
      .sort({ date: -1, _id: -1 })
      .populate('playerId', 'fullName')
      .lean();
    const countMap = getAttendancePresentCountMapFromRecords(children, attendance);
    const childrenWithCounters = children.map((child) => {
      const childObject = child.toObject({ virtuals: true });
      const childKey = String(child._id);
      return {
        ...childObject,
        attendancePresentCount: countMap.get(childKey) || 0
      };
    });
    res.json({ children: childrenWithCounters, attendance });
  } catch (error) {
    next(error);
  }
};

const getParentAttendanceHistory = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const player = await Player.findOne({ _id: req.params.playerId, parentId: parent._id })
      .select('_id fullName startDate endDate packageName packageClasses packageHours payment currentSubscriptionStartedAt createdAt')
      .populate('subscriptionId', 'totalSessions usedSessions remainingSessions startDate endDate status price');
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }

    const relatedPlayers = await Player.find({
      parentId: parent._id,
      fullName: new RegExp(`^${String(player.fullName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    })
      .select('_id fullName startDate endDate packageName packageClasses packageHours payment currentSubscriptionStartedAt createdAt')
      .populate('subscriptionId', 'totalSessions usedSessions remainingSessions startDate endDate status price');
    const relatedPlayerIds = relatedPlayers.map((child) => child._id);
    const historyEntries = await HistoryEntry.aggregate([
      { $match: { entityType: 'player', entityId: { $in: relatedPlayerIds } } },
      { $sort: { changedAt: 1, _id: 1 } },
      {
        $project: {
          entityId: 1,
          action: 1,
          changedFields: 1,
          changedAt: 1,
          after: {
            startDate: '$after.startDate',
            endDate: '$after.endDate',
            currentSubscriptionStartedAt: '$after.currentSubscriptionStartedAt',
            createdAt: '$after.createdAt',
            packageName: '$after.packageName',
            packageClasses: '$after.packageClasses',
            packageHours: '$after.packageHours',
            payment: '$after.payment'
          }
        }
      }
    ]);
    const historyByPlayerId = historyEntries.reduce((map, entry) => {
      const playerId = String(entry.entityId);
      if (!map.has(playerId)) map.set(playerId, []);
      map.get(playerId).push(entry);
      return map;
    }, new Map());
    const cycles = relatedPlayers.flatMap((child) => buildSubscriptionHistory(historyByPlayerId.get(String(child._id)) || [], child));
    res.json({ subscriptionHistory: normalizeSubscriptionCycles(cycles).sort((first, second) => new Date(second.startDate) - new Date(first.startDate)) });
  } catch (error) {
    next(error);
  }
};

const getParentPayments = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const children = await Player.find({ parentId: parent._id })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id fullName profileImage startDate endDate packageName packageClasses packageHours payment previousDueBalance dueAdjustment attendanceDueManual currentSubscriptionStartedAt currentSubscriptionAttendanceIds currentSubscriptionExcludedAttendanceIds subscriptionId createdAt updatedAt')
      .populate('subscriptionId', 'totalSessions usedSessions remainingSessions startDate endDate status price');
    const childIds = children.map((child) => child._id);
    const payments = await Payment.find({ playerId: { $in: childIds } })
      .sort({ paymentDate: -1, _id: -1 })
      .populate({
        path: 'playerId',
        select: 'fullName profileImage startDate endDate packageName packageClasses packageHours payment previousDueBalance dueAdjustment attendanceDueManual currentSubscriptionStartedAt currentSubscriptionAttendanceIds currentSubscriptionExcludedAttendanceIds subscriptionId',
        populate: { path: 'subscriptionId', select: 'totalSessions usedSessions remainingSessions startDate endDate status price' }
      })
      .populate('subscriptionId', 'price startDate endDate totalSessions usedSessions remainingSessions status')
      .lean();
    const [countMap, paymentSummaryMap] = await Promise.all([
      getAttendancePresentCountMap(children),
      getCurrentPaymentSummaryMap(children)
    ]);

    const paymentRows = payments.map((payment) => {
      const playerId = String(payment.playerId?._id || payment.playerId || '');
      const paymentSummary = paymentSummaryMap.get(playerId);
      if (payment.playerId && typeof payment.playerId === 'object') {
        payment.playerId.attendancePresentCount = countMap.get(playerId) || 0;
        payment.playerId.currentSubscriptionPaidAmount = paymentSummary?.paidAmount || 0;
      }
      return isSubscriptionPaymentType(payment.transactionType)
        ? {
          ...payment,
          totalAmount: paymentSummary?.totalAmount ?? payment.totalAmount,
          visiblePaidAmount: Number(payment.playerId?.payment || 0),
          visibleRemainingAmount: paymentSummary?.remainingAmount ?? payment.remainingAmount,
          remainingAmount: paymentSummary?.remainingAmount ?? payment.remainingAmount
        }
        : { ...payment, visiblePaidAmount: Number(payment.playerId?.payment || 0), visibleRemainingAmount: 0, remainingAmount: 0 };
    });

    const playersWithPaymentRows = new Set(paymentRows.map((payment) => String(payment.playerId?._id || payment.playerId || '')).filter(Boolean));
    children.forEach((child) => {
      const childId = String(child._id);
      const visibleRemainingAmount = getParentVisibleRemaining(child);
      if (!visibleRemainingAmount || playersWithPaymentRows.has(childId)) return;
      const childObject = child.toObject({ virtuals: true });
      childObject.currentSubscriptionPaidAmount = 0;
      childObject.attendancePresentCount = countMap.get(childId) || 0;
      paymentRows.push({
        _id: `due-${childId}`,
        playerId: childObject,
        paymentDate: child.updatedAt || child.createdAt || new Date(),
        paidAmount: 0,
        visiblePaidAmount: Number(child.payment || 0),
        totalAmount: visibleRemainingAmount,
        remainingAmount: visibleRemainingAmount,
        visibleRemainingAmount,
        transactionType: 'Due',
        paymentMethod: '-'
      });
    });

    res.json(paymentRows);
  } catch (error) {
    next(error);
  }
};

const getParentDashboard = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const children = await Player.find({ parentId: parent._id })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id fullName dateOfBirth profileImage status programId groupId groupIds coachId subscriptionId startDate endDate packageName packageClasses packageHours payment previousDueBalance dueAdjustment attendanceDueManual currentSubscriptionStartedAt')
      .populate('programId', 'name')
      .populate('groupId', 'name')
      .populate('groupIds', 'name')
      .populate('coachId', 'name')
      .populate('subscriptionId', 'type status remainingSessions usedSessions startDate endDate price');
    const paymentSummaryMap = await getCurrentPaymentSummaryMap(children);
    const childSummaries = children.map((child) => {
      const subscription = child.subscriptionId || {};
      const paymentSummary = paymentSummaryMap.get(String(child._id));
      const childObject = child.toObject({ virtuals: true });
      const visibleRemainingAmount = getParentVisibleRemaining(child);
      const paidTotal = Number(child.payment || 0);
      const daysRemaining = subscription.type === 'time' && subscription.endDate
        ? Math.max(0, Math.ceil((subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)))
        : null;
      return {
        ...childObject,
        attendanceDueManual: Boolean(child.attendanceDueManual),
        paidTotal,
        currentSubscriptionPaidAmount: paymentSummary?.paidAmount || 0,
        visibleRemainingAmount,
        remainingAmount: visibleRemainingAmount,
        daysRemaining
      };
    });
    const notifications = await Notification.find({ recipientUserId: req.user._id }).sort({ createdAt: -1 }).limit(10);
    res.json({ children: childSummaries, attendance: [], payments: [], notifications });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getParents,
  getParentById,
  createParent,
  updateParent,
  deleteParent,
  getParentMe,
  getParentChildren,
  getParentAttendance,
  getParentAttendanceHistory,
  getParentPayments,
  getParentDashboard
};
