const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Parent = require('../models/Parent');
const Notification = require('../models/Notification');
const Player = require('../models/Player');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt } = require('../utils/encryption');

const getPayments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.playerId && validateObjectId(req.query.playerId)) {
      filter.playerId = req.query.playerId;
    }
    if (req.query.subscriptionId && validateObjectId(req.query.subscriptionId)) {
      filter.subscriptionId = req.query.subscriptionId;
    }
    const payments = await Payment.find(filter)
      .sort({ paymentDate: -1 })
      .populate({
        path: 'playerId',
        select: 'fullName parentId',
        populate: { path: 'parentId', select: 'name email' }
      })
      .populate('subscriptionId', 'type status price packageName totalSessions remainingSessions')
      .populate('createdBy', 'name email');
    res.json(payments);
  } catch (error) {
    next(error);
  }
};

const createPayment = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { playerId, subscriptionId, paidAmount, paymentMethod, receiptImage, notes } = payload;
    if (!validateObjectId(playerId) || !validateObjectId(subscriptionId) || paidAmount == null) {
      return res.status(400).json({ message: 'Payment requires player, subscription, and paid amount.' });
    }
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found.' });
    }
    if (subscription.price == null) {
      return res.status(400).json({ message: 'Subscription price is not configured.' });
    }
    const previousPaid = await Payment.aggregate([
      { $match: { subscriptionId: subscription._id } },
      { $group: { _id: '$subscriptionId', totalPaid: { $sum: '$paidAmount' } } }
    ]);
    const totalPaidBefore = previousPaid[0]?.totalPaid || 0;
    const totalPaidAfter = totalPaidBefore + Number(paidAmount);
    const remainingAmount = Math.max(0, subscription.price - totalPaidAfter);
    if (Number(paidAmount) > subscription.price - totalPaidBefore) {
      return res.status(400).json({ message: `Payment exceeds remaining balance of ${subscription.price - totalPaidBefore}.` });
    }
    const payment = await Payment.create({
      playerId,
      subscriptionId,
      totalAmount: subscription.price,
      paidAmount: Number(paidAmount),
      remainingAmount,
      paymentMethod,
      receiptImage: receiptImage || '',
      notesEncrypted: encrypt(notes || ''),
      createdBy: req.user._id
    });
    if (subscription) {
      await subscription.save();
    }
    const parentRecord = await Parent.findById(player.parentId).populate('userId');
    if (parentRecord?.userId) {
      await Notification.create({
        recipientUserId: parentRecord.userId._id,
        title: 'Payment received',
        message: `Payment recorded for ${player.fullName}.`,
        type: 'payment'
      });
    }
    await createAuditLog({ userId: req.user._id, action: 'create payment', entity: 'Payment', entityId: payment._id, req });
    res.status(201).json(payment);
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
    const payments = await Payment.find({ playerId }).sort({ paymentDate: -1 });
    res.json(payments);
  } catch (error) {
    next(error);
  }
};

module.exports = { getPayments, createPayment, getPaymentsByPlayer };
