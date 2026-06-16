const Payment = require('../models/Payment');
const Parent = require('../models/Parent');
const Notification = require('../models/Notification');
const Player = require('../models/Player');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');
const { parseLocalizedNumber } = require('../utils/numberInput');
const { snapshotPaymentDocument, createHistoryEntry } = require('../utils/history');

const populatePaymentQuery = (query) => query
  .populate({
    path: 'playerId',
    select: 'fullName parentId isDeleted deletedAt packageName packageClasses packageHours payment',
    populate: { path: 'parentId', select: 'name email' }
  })
  .populate('createdBy', 'name email')
  .populate('updatedBy', 'name email');

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
  delete obj.notesEncrypted;
  return obj;
};

const recalculatePlayerPayments = async (playerId) => {
  const player = await Player.findById(playerId);
  if (!player) return;

  const payments = await Payment.find({ playerId }).sort({ paymentDate: 1, _id: 1 });
  const totalAmount = Number(player.payment || 0);
  let runningPaid = 0;

  for (const payment of payments) {
    runningPaid += Number(payment.paidAmount || 0);
    payment.totalAmount = totalAmount;
    payment.remainingAmount = totalAmount ? Math.max(0, totalAmount - runningPaid) : 0;
    await payment.save();
  }
};

const getPayments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.playerId && validateObjectId(req.query.playerId)) {
      filter.playerId = req.query.playerId;
    }
    const payments = await populatePaymentQuery(Payment.find(filter).sort({ paymentDate: -1 }));
    res.json(payments.map(formatPaymentResponse));
  } catch (error) {
    next(error);
  }
};

const createPayment = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { playerId, paidAmount, paymentMethod, receiptImage, notes } = payload;
    if (!validateObjectId(playerId) || paidAmount == null) {
      return res.status(400).json({ message: 'Payment requires player and paid amount.' });
    }
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const previousPaid = await Payment.aggregate([
      { $match: { playerId: player._id } },
      { $group: { _id: '$playerId', totalPaid: { $sum: '$paidAmount' } } }
    ]);
    const playerTotalAmount = Number(player.payment || 0);
    const totalPaidBefore = previousPaid[0]?.totalPaid || 0;
    const totalPaidAfter = totalPaidBefore + parseLocalizedNumber(paidAmount);
    const remainingAmount = playerTotalAmount ? Math.max(0, playerTotalAmount - totalPaidAfter) : 0;
    const parentRecord = await Parent.findById(player.parentId).populate('userId');
    const payment = await Payment.create({
      playerId,
      playerNameSnapshot: player.fullName || '',
      parentNameSnapshot: parentRecord?.name || '',
      packageNameSnapshot: player.packageName || '',
      packageClassesSnapshot: parseLocalizedNumber(player.packageClasses),
      packageHoursSnapshot: parseLocalizedNumber(player.packageHours),
      totalAmount: playerTotalAmount,
      paidAmount: parseLocalizedNumber(paidAmount),
      remainingAmount,
      paymentMethod,
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
    res.status(201).json(formatPaymentResponse(createdPayment));
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
    res.json(formatPaymentResponse(updatedPayment));
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
    const payments = await populatePaymentQuery(Payment.find({ playerId }).sort({ paymentDate: -1 }));
    res.json(payments.map(formatPaymentResponse));
  } catch (error) {
    next(error);
  }
};

module.exports = { getPayments, createPayment, updatePayment, deletePayment, getPaymentsByPlayer };
