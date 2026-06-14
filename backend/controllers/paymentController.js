const Payment = require('../models/Payment');
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
    const payments = await Payment.find(filter)
      .sort({ paymentDate: -1 })
      .populate({
        path: 'playerId',
        select: 'fullName parentId isDeleted deletedAt packageName packageClasses packageHours payment',
        populate: { path: 'parentId', select: 'name email' }
      })
      .populate('createdBy', 'name email');
    res.json(payments);
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
    const totalPaidAfter = totalPaidBefore + Number(paidAmount);
    const remainingAmount = playerTotalAmount ? Math.max(0, playerTotalAmount - totalPaidAfter) : 0;
    const parentRecord = await Parent.findById(player.parentId).populate('userId');
    const payment = await Payment.create({
      playerId,
      playerNameSnapshot: player.fullName || '',
      parentNameSnapshot: parentRecord?.name || '',
      packageNameSnapshot: player.packageName || '',
      packageClassesSnapshot: Number(player.packageClasses || 0),
      packageHoursSnapshot: Number(player.packageHours || 0),
      totalAmount: playerTotalAmount,
      paidAmount: Number(paidAmount),
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
