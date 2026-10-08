const Payment = require('../models/Payment');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const Attendance = require('../models/Attendance');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { parseLocalizedNumber } = require('../utils/numberInput');
const { snapshotPaymentDocument, createHistoryEntry } = require('../utils/history');
const { createNotification } = require('../utils/notificationDelivery');
const { getAppDateOnly, getAppDayRangeUtc, getAppDayStartUtc, dateKeyToUtc } = require('../utils/appDate');
const { getCurrentSubscriptionStart } = require('../utils/subscriptionCycle');
const { getRemainingAmount } = require('../utils/manualRemaining');

const populatePaymentQuery = (query) => query
  .populate({
    path: 'playerId',
    select: 'fullName parentId parentPhoneEncrypted isDeleted deletedAt packageName packageClasses packageHours payment previousDueBalance dueAdjustment attendanceDueManual preservedRemainingBalance startDate endDate currentSubscriptionStartedAt currentSubscriptionAttendanceIds currentSubscriptionExcludedAttendanceIds subscriptionId',
    populate: [
      {
        path: 'parentId',
        select: 'name email phoneEncrypted userId',
        populate: { path: 'userId', select: 'phone' }
      },
      {
        path: 'subscriptionId',
        select: 'totalSessions usedSessions remainingSessions startDate endDate status'
      }
    ]
  })
  .populate('createdBy', 'name email')
  .populate('updatedBy', 'name email');

const normalizePhoneValue = (value) => {
  const text = String(value || '').trim();
  return /\d/.test(text) && !text.includes(':') ? text : '';
};

const decryptOptional = (value) => {
  if (!value) return '';
  try {
    return normalizePhoneValue(decrypt(value));
  } catch (err) {
    return normalizePhoneValue(value);
  }
};

const isSubscriptionPaymentType = (value) => ['full payment', 'partial payment'].includes(String(value || '').trim().toLowerCase());
const getPlayerSubscriptionAmount = (player) => Math.max(0, Number(player?.payment || 0));
const getPaginationOptions = (query) => {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 0, 0), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { limit, page, skip: limit ? (page - 1) * limit : 0 };
};

const isOnOrAfter = (value, date) => {
  if (!value || !date) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed >= date;
};

const isPaymentInPlayerCurrentSubscription = (payment, player) => {
  const subscriptionStart = getCurrentSubscriptionStart(player);
  if (!subscriptionStart) return true;
  return isOnOrAfter(payment.paymentDate, subscriptionStart) || isOnOrAfter(payment.createdAt, subscriptionStart);
};

const formatPaymentResponse = (payment) => {
  const obj = payment.toObject();
  if (obj.notesEncrypted) {
    try {
      obj.notes = decrypt(obj.notesEncrypted);
    } catch (err) {
      obj.notes = '';
    }
  } else {
    obj.notes = '';
  }
  if (obj.playerId?.parentId) {
    obj.playerId.parentId.phone = decryptOptional(obj.playerId.parentId.phoneEncrypted)
      || normalizePhoneValue(obj.playerId.parentId.userId?.phone);
    delete obj.playerId.parentId.phoneEncrypted;
  }
  if (obj.playerId?.parentPhoneEncrypted) {
    obj.playerId.parentPhone = decryptOptional(obj.playerId.parentPhoneEncrypted);
    delete obj.playerId.parentPhoneEncrypted;
  }
  delete obj.notesEncrypted;
  return obj;
};

const parsePaymentDate = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error('Invalid payment date.');
    error.statusCode = 400;
    throw error;
  }
  return parsed;
};

const getTransactionType = (value, remainingAmount) => {
  if (value) return String(value).trim();
  return Number(remainingAmount || 0) <= 0 ? 'Full payment' : 'Partial payment';
};
const getSubscriptionTransactionType = (remainingAmount) => (
  Number(remainingAmount || 0) <= 0 ? 'Full payment' : 'Partial payment'
);

const getDateOnly = (value) => {
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : getAppDateOnly(date);
};

const getPlayerIdFromPayment = (payment) => {
  const player = payment?.playerId;
  return player?._id ? String(player._id) : String(player || '');
};

const getPaymentPlayers = (payments) => {
  const playerMap = new Map();
  payments.forEach((payment) => {
    const player = payment?.playerId;
    if (player?._id) {
      playerMap.set(String(player._id), player);
    }
  });
  return [...playerMap.values()];
};

const getCurrentPaymentSummaryMap = async (players) => {
  const playerIds = players.map((player) => player._id).filter(Boolean);
  if (!playerIds.length) return new Map();

  const playerById = new Map(players.map((player) => [String(player._id), player]));
  const paymentRows = await Payment.find({
    isDeleted: { $ne: true },
    playerId: { $in: playerIds },
    transactionType: { $in: ['Full payment', 'Partial payment'] }
  }).select('playerId paidAmount paymentDate createdAt transactionType').lean();

  const summaryMap = new Map(players.map((player) => {
    const totalAmount = getPlayerSubscriptionAmount(player);
    const remainingAmount = getRemainingAmount(player);
    return [String(player._id), {
      totalAmount,
      paidAmount: 0,
      remainingAmount,
      displayRemainingAmount: remainingAmount
    }];
  }));

  paymentRows.forEach((payment) => {
    const playerId = String(payment.playerId);
    const player = playerById.get(playerId);
    const summary = summaryMap.get(playerId);
    if (!player || !summary || !isPaymentInPlayerCurrentSubscription(payment, player)) return;
    summary.paidAmount += Number(payment.paidAmount || 0);
  });

  return summaryMap;
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

const formatPaymentsWithAttendanceCounts = async (payments) => {
  const paymentRows = Array.isArray(payments) ? payments : [payments].filter(Boolean);
  const paymentPlayers = getPaymentPlayers(paymentRows);
  const [countMap, paymentSummaryMap] = await Promise.all([
    getAttendancePresentCountMap(paymentPlayers),
    getCurrentPaymentSummaryMap(paymentPlayers)
  ]);
  const formattedRows = paymentRows.map((payment) => {
    const row = formatPaymentResponse(payment);
    row.remainingAmount = 0;
    if (row.playerId && typeof row.playerId === 'object') {
      row.playerId.preservedRemainingBalance = 0;
      const playerKey = getPlayerIdFromPayment(payment);
      const paymentSummary = paymentSummaryMap.get(playerKey);
      row.playerId.attendancePresentCount = countMap.get(playerKey) || 0;
      row.playerId.currentSubscriptionPaidAmount = paymentSummary?.paidAmount || 0;
      if (isSubscriptionPaymentType(row.transactionType) && paymentSummary) {
        row.totalAmount = paymentSummary.totalAmount;
        row.remainingAmount = paymentSummary.displayRemainingAmount ?? paymentSummary.remainingAmount;
      }
    }
    return row;
  });
  return Array.isArray(payments) ? formattedRows : formattedRows[0];
};

const getCurrentSubscriptionPaymentMatch = (player) => {
  const match = { playerId: player._id, isDeleted: { $ne: true } };
  const subscriptionStart = getCurrentSubscriptionStart(player);
  if (subscriptionStart) {
    match.$or = [
      { paymentDate: { $gte: subscriptionStart } },
      { createdAt: { $gte: subscriptionStart } }
    ];
  }
  return match;
};

const getPayments = async (req, res, next) => {
  try {
    const filter = { isDeleted: { $ne: true } };
    if (req.parentScope) filter.$and = [{ playerId: { $in: req.parentScope.playerIds } }];
    if (req.query.playerId && validateObjectId(req.query.playerId)) {
      filter.playerId = req.query.playerId;
    }
    if (req.query.day) {
      const key = String(req.query.day);
      const date = dateKeyToUtc(key);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) {
        return res.status(400).json({ message: 'Invalid payment day.' });
      }
      const { start, end } = getAppDayRangeUtc(key);
      filter.paymentDate = { $gte: start, $lt: end };
    } else if (req.query.month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month))) {
        return res.status(400).json({ message: 'Invalid payment month.' });
      }
      const [year, month] = String(req.query.month).split('-').map(Number);
      const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      filter.paymentDate = { $gte: getAppDayStartUtc(`${req.query.month}-01`), $lt: getAppDayStartUtc(next) };
    }
    const search = String(req.query.search || '').trim().slice(0, 120);
    if (search) {
      const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const parents = await Parent.find({ name: pattern }).select('_id').lean();
      const players = await Player.find({ $or: [{ fullName: pattern }, { parentId: { $in: parents.map((row) => row._id) } }] }).select('_id').lean();
      const fields = ['playerNameSnapshot', 'parentNameSnapshot', 'parentPhoneSnapshot', 'transactionType', 'paymentMethod', 'packageNameSnapshot', 'receiptImage'];
      const alternatives = fields.map((key) => ({ [key]: pattern }));
      alternatives.push({ playerId: { $in: players.map((row) => row._id) } });
      if (Number.isFinite(Number(search))) alternatives.push({ paidAmount: Number(search) });
      filter.$and = [...(filter.$and || []), { $or: alternatives }];
    }
    const { limit, page, skip } = getPaginationOptions(req.query);
    const query = populatePaymentQuery(Payment.find(filter).sort({ paymentDate: -1, _id: -1 }));
    if (limit) query.skip(skip).limit(limit);
    const [payments, summaryRows] = await Promise.all([
      query,
      limit ? Payment.find(filter).select('playerId paidAmount transactionType').lean() : Promise.resolve(null)
    ]);
    const items = await formatPaymentsWithAttendanceCounts(payments);
    if (limit) {
      const balancePlayers = await Player.find({ _id: { $in: summaryRows
        .filter((row) => isSubscriptionPaymentType(row.transactionType))
        .map((row) => row.playerId).filter(Boolean) } })
        .select('previousDueBalance dueAdjustment attendanceDueManual').lean();
      const total = summaryRows.length;
      return res.json({
        items,
        total,
        totals: {
          paid: summaryRows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0),
          remaining: balancePlayers.reduce((sum, row) => sum + getRemainingAmount(row), 0)
        },
        page,
        limit,
        hasMore: skip + payments.length < total
      });
    }
    res.json(items);
  } catch (error) {
    next(error);
  }
};

const createPayment = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { playerId, customPlayerName, paidAmount, paymentMethod, paymentDate, receiptImage, notes, transactionType } = payload;
    const customName = String(customPlayerName || '').trim();
    const hasPlayer = validateObjectId(playerId);
    if ((!hasPlayer && !customName) || paidAmount == null) {
      return res.status(400).json({ message: 'Payment requires a player or custom name and paid amount.' });
    }
    if (!hasPlayer) {
      const payment = await Payment.create({
        playerNameSnapshot: customName,
        parentNameSnapshot: '',
        parentPhoneSnapshot: '',
        packageNameSnapshot: 'Custom',
        packageClassesSnapshot: 0,
        packageHoursSnapshot: 0,
        totalAmount: 0,
        paidAmount: parseLocalizedNumber(paidAmount),
        remainingAmount: 0,
        transactionType: getTransactionType(transactionType, 0),
        paymentMethod,
        paymentDate: parsePaymentDate(paymentDate),
        receiptImage: receiptImage || '',
        notesEncrypted: encrypt(notes || ''),
        createdBy: req.user._id
      });
      const paymentForHistory = await loadPaymentForHistory(payment._id);
      await createHistoryEntry({
        entityType: 'payment',
        entityId: payment._id,
        action: 'create',
        after: snapshotPaymentDocument(paymentForHistory),
        userId: req.user._id,
        req
      });
      await createAuditLog({ userId: req.user._id, action: 'create custom payment', entity: 'Payment', entityId: payment._id, req });
      const createdPayment = await populatePaymentQuery(Payment.findById(payment._id));
      return res.status(201).json(await formatPaymentsWithAttendanceCounts(createdPayment));
    }
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const subscriptionPayment = !transactionType || isSubscriptionPaymentType(transactionType);
    const previousPaid = subscriptionPayment ? await Payment.aggregate([
      { $match: getCurrentSubscriptionPaymentMatch(player) },
      { $match: { transactionType: { $in: ['Full payment', 'Partial payment'] } } },
      { $group: { _id: '$playerId', totalPaid: { $sum: '$paidAmount' } } }
    ]) : [];
    const playerTotalAmount = getPlayerSubscriptionAmount(player);
    const totalPaidBefore = previousPaid[0]?.totalPaid || 0;
    const totalPaidAfter = totalPaidBefore + parseLocalizedNumber(paidAmount);
    const remainingAmount = subscriptionPayment && playerTotalAmount ? Math.max(0, playerTotalAmount - totalPaidAfter) : 0;
    const displayRemainingAmount = subscriptionPayment ? getRemainingAmount(player) : 0;
    const parentRecord = await Parent.findById(player.parentId).populate('userId');
    const payment = await Payment.create({
      playerId,
      playerNameSnapshot: player.fullName || '',
      parentNameSnapshot: parentRecord?.name || '',
      parentPhoneSnapshot: decryptOptional(parentRecord?.phoneEncrypted) || normalizePhoneValue(parentRecord?.userId?.phone),
      packageNameSnapshot: player.packageName || '',
      packageClassesSnapshot: parseLocalizedNumber(player.packageClasses),
      packageHoursSnapshot: parseLocalizedNumber(player.packageHours),
      totalAmount: subscriptionPayment ? playerTotalAmount : 0,
      paidAmount: parseLocalizedNumber(paidAmount),
      remainingAmount: displayRemainingAmount,
      transactionType: subscriptionPayment ? getSubscriptionTransactionType(remainingAmount) : getTransactionType(transactionType, 0),
      paymentMethod,
      paymentDate: parsePaymentDate(paymentDate),
      receiptImage: receiptImage || '',
      notesEncrypted: encrypt(notes || ''),
      createdBy: req.user._id
    });
    if (parentRecord?.userId) {
      await createNotification({
        recipientUserId: parentRecord.userId._id,
        title: 'Payment received',
        message: `Payment recorded for ${player.fullName}.`,
        type: 'payment'
      }, { waitForPush: false }).catch((error) => {
        console.error('Payment notification failed:', error.message);
      });
    }
    const paymentForHistory = await loadPaymentForHistory(payment._id);
    await createHistoryEntry({
      entityType: 'payment',
      entityId: payment._id,
      action: 'create',
      after: snapshotPaymentDocument(paymentForHistory),
      userId: req.user._id,
      req
    });
    await createAuditLog({ userId: req.user._id, action: 'create payment', entity: 'Payment', entityId: payment._id, req });
    const createdPayment = await populatePaymentQuery(Payment.findById(payment._id));
    res.status(201).json(await formatPaymentsWithAttendanceCounts(createdPayment));
  } catch (error) {
    next(error);
  }
};

const loadPaymentForHistory = (paymentId) => populatePaymentQuery(Payment.findById(paymentId));

const updatePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid payment ID.' });
    }
    const payload = sanitizeObject(req.body);
    const payment = await Payment.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }
    const beforePayment = await loadPaymentForHistory(id);
    const beforeSnapshot = snapshotPaymentDocument(beforePayment);

    if (payload.paidAmount != null) {
      payment.paidAmount = parseLocalizedNumber(payload.paidAmount);
    }
    if (payload.paymentMethod) {
      payment.paymentMethod = payload.paymentMethod;
    }
    if (payload.transactionType) {
      payment.transactionType = getTransactionType(payload.transactionType, payment.remainingAmount);
    }
    if (typeof payload.paymentDate !== 'undefined') {
      payment.paymentDate = parsePaymentDate(payload.paymentDate);
    }
    if (typeof payload.receiptImage !== 'undefined') {
      payment.receiptImage = payload.receiptImage || '';
    }
    if (typeof payload.notes !== 'undefined') {
      payment.notesEncrypted = encrypt(payload.notes || '');
    }
    if (!payment.playerId && typeof payload.customPlayerName !== 'undefined') {
      payment.playerNameSnapshot = String(payload.customPlayerName || '').trim();
    }
    payment.updatedBy = req.user._id;
    payment.updatedAt = new Date();
    await payment.save();
    const afterPayment = await loadPaymentForHistory(id);
    await createHistoryEntry({
      entityType: 'payment',
      entityId: payment._id,
      action: 'update',
      before: beforeSnapshot,
      after: snapshotPaymentDocument(afterPayment),
      userId: req.user._id,
      req
    });
    await createAuditLog({ userId: req.user._id, action: 'update payment', entity: 'Payment', entityId: payment._id, req });

    const updatedPayment = await populatePaymentQuery(Payment.findById(payment._id));
    res.json(await formatPaymentsWithAttendanceCounts(updatedPayment));
  } catch (error) {
    next(error);
  }
};

const deletePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid payment ID.' });
    }
    const payment = await Payment.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }
    const paymentForHistory = await loadPaymentForHistory(id);
    const beforeSnapshot = snapshotPaymentDocument(paymentForHistory);
    payment.isDeleted = true;
    payment.deletedAt = new Date();
    payment.deletedBy = req.user._id;
    await payment.save();
    await createHistoryEntry({
      entityType: 'payment',
      entityId: payment._id,
      action: 'delete',
      before: beforeSnapshot,
      userId: req.user._id,
      req
    });
    await createAuditLog({ userId: req.user._id, action: 'delete payment', entity: 'Payment', entityId: id, req });
    res.json({ message: 'Payment deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const getPaymentsByPlayer = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    if (!validateObjectId(playerId)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const payments = await populatePaymentQuery(Payment.find({ playerId, isDeleted: { $ne: true } }).sort({ paymentDate: -1, _id: -1 }));
    res.json(await formatPaymentsWithAttendanceCounts(payments));
  } catch (error) {
    next(error);
  }
};

module.exports = { getPayments, createPayment, updatePayment, deletePayment, getPaymentsByPlayer };
