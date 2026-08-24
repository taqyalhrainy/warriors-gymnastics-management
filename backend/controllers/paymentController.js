const Payment = require('../models/Payment');
const Parent = require('../models/Parent');
const Notification = require('../models/Notification');
const Player = require('../models/Player');
const Attendance = require('../models/Attendance');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { parseLocalizedNumber } = require('../utils/numberInput');
const { snapshotPaymentDocument, createHistoryEntry } = require('../utils/history');

const populatePaymentQuery = (query) => query
  .populate({
    path: 'playerId',
    select: 'fullName parentId parentPhoneEncrypted isDeleted deletedAt packageName packageClasses packageHours payment previousDueBalance dueAdjustment startDate endDate currentSubscriptionStartedAt currentSubscriptionAttendanceIds currentSubscriptionExcludedAttendanceIds subscriptionId',
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

const recalculatePlayerPayments = async (playerId) => {
  const player = await Player.findById(playerId);
  if (!player) return;

  const payments = await Payment.find({ playerId }).sort({ paymentDate: 1, _id: 1 });
  const totalAmount = Number(player.previousDueBalance || 0) + Number(player.payment || 0);
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

const isSubscriptionPaymentType = (value) => ['full payment', 'partial payment'].includes(String(value || '').trim().toLowerCase());

const getDateOnly = (value) => {
  const date = value ? new Date(value) : new Date(0);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getCurrentSubscriptionStart = (player) => {
  const rawDate = player?.currentSubscriptionStartedAt || player?.startDate || player?.subscriptionId?.startDate;
  if (!rawDate) return null;
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
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
  const countMap = await getAttendancePresentCountMap(getPaymentPlayers(paymentRows));
  const formattedRows = paymentRows.map((payment) => {
    const row = formatPaymentResponse(payment);
    if (row.playerId && typeof row.playerId === 'object') {
      row.playerId.attendancePresentCount = countMap.get(getPlayerIdFromPayment(payment)) || 0;
    }
    return row;
  });
  return Array.isArray(payments) ? formattedRows : formattedRows[0];
};

const getCurrentSubscriptionPaymentMatch = (player) => {
  const match = { playerId: player._id };
  if (player.currentSubscriptionStartedAt) {
    match.createdAt = { $gte: new Date(player.currentSubscriptionStartedAt) };
  } else if (player.startDate) {
    match.paymentDate = { $gte: new Date(player.startDate) };
  }
  return match;
};

const getPayments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.playerId && validateObjectId(req.query.playerId)) {
      filter.playerId = req.query.playerId;
    }
    if (req.query.day) {
      const start = new Date(`${req.query.day}T00:00:00.000`);
      const end = new Date(`${req.query.day}T23:59:59.999`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        filter.paymentDate = { $gte: start, $lte: end };
      }
    } else if (req.query.month && /^\d{4}-\d{2}$/.test(String(req.query.month))) {
      const [year, month] = String(req.query.month).split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      filter.paymentDate = { $gte: start, $lte: end };
    }
    const payments = await populatePaymentQuery(Payment.find(filter).sort({ paymentDate: -1, _id: -1 }));
    res.json(await formatPaymentsWithAttendanceCounts(payments));
  } catch (error) {
    next(error);
  }
};

const createPayment = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { playerId, paidAmount, paymentMethod, paymentDate, receiptImage, notes, transactionType } = payload;
    if (!validateObjectId(playerId) || paidAmount == null) {
      return res.status(400).json({ message: 'Payment requires player and paid amount.' });
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
    const playerTotalAmount = Number(player.previousDueBalance || 0) + Number(player.payment || 0) - Number(player.dueAdjustment || 0);
    const totalPaidBefore = previousPaid[0]?.totalPaid || 0;
    const totalPaidAfter = totalPaidBefore + parseLocalizedNumber(paidAmount);
    const remainingAmount = subscriptionPayment && playerTotalAmount ? Math.max(0, playerTotalAmount - totalPaidAfter) : 0;
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
      remainingAmount,
      transactionType: getTransactionType(transactionType, remainingAmount),
      paymentMethod,
      paymentDate: parsePaymentDate(paymentDate),
      receiptImage: receiptImage || '',
      notesEncrypted: encrypt(notes || ''),
      createdBy: req.user._id
    });
    if (parentRecord?.userId) {
      await Notification.create({
        recipientUserId: parentRecord.userId._id,
        title: 'Payment received',
        message: `Payment recorded for ${player.fullName}.`,
        type: 'payment'
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
    await recalculatePlayerPayments(player._id);
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
    const payment = await Payment.findById(id);
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
    payment.updatedBy = req.user._id;
    payment.updatedAt = new Date();
    await payment.save();
    await recalculatePlayerPayments(payment.playerId);
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
    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }
    const paymentForHistory = await loadPaymentForHistory(id);
    const beforeSnapshot = snapshotPaymentDocument(paymentForHistory);
    const { playerId } = payment;
    await payment.deleteOne();
    await recalculatePlayerPayments(playerId);
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
    const payments = await populatePaymentQuery(Payment.find({ playerId }).sort({ paymentDate: -1, _id: -1 }));
    res.json(await formatPaymentsWithAttendanceCounts(payments));
  } catch (error) {
    next(error);
  }
};

module.exports = { getPayments, createPayment, updatePayment, deletePayment, getPaymentsByPlayer };
