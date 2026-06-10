const Subscription = require('../models/Subscription');
const Player = require('../models/Player');
const Program = require('../models/Program');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const getSubscriptions = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.playerId && validateObjectId(req.query.playerId)) {
      filter.playerId = req.query.playerId;
    }
    const subscriptions = await Subscription.find(filter).populate('playerId', 'fullName');
    const populated = subscriptions.map((subscription) => {
      const sub = subscription.toObject();
      if (sub.type === 'time' && sub.endDate) {
        const today = new Date();
        const endDate = new Date(sub.endDate);
        const daysRemaining = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
        sub.daysRemaining = daysRemaining;
        if (daysRemaining <= 0) {
          sub.status = 'expired';
        } else if (daysRemaining <= 7) {
          sub.status = 'almost_expired';
        }
      }
      return sub;
    });
    res.json(populated);
  } catch (error) {
    next(error);
  }
};

const createSubscription = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { playerId, type, packageName, totalSessions, startDate, endDate, price } = payload;
    if (!validateObjectId(playerId) || !type || !startDate || !endDate || !packageName) {
      return res.status(400).json({ message: 'Player, type, package, start date, and end date are required.' });
    }
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const program = await Program.findOne({ name: packageName });
    if (!program) {
      return res.status(400).json({ message: 'Selected package is invalid. Please choose an existing program package.' });
    }
    const remainingSessions = type === 'sessions' ? Number(totalSessions || 0) : 0;
    const subscription = await Subscription.create({
      playerId,
      type,
      packageName: program.name,
      totalSessions: Number(totalSessions || 0),
      usedSessions: 0,
      remainingSessions,
      startDate,
      endDate,
      price: Number(program.price || price || 0),
      status: 'active'
    });
    player.subscriptionId = subscription._id;
    await player.save();
    await createAuditLog({ userId: req.user._id, action: 'create subscription', entity: 'Subscription', entityId: subscription._id, req });
    res.status(201).json(subscription);
  } catch (error) {
    next(error);
  }
};

const updateSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid subscription ID.' });
    }
    const payload = sanitizeObject(req.body);
    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found.' });
    }
    Object.assign(subscription, payload);
    if (subscription.type === 'sessions') {
      subscription.remainingSessions = Math.max(0, subscription.totalSessions - subscription.usedSessions);
    }
    if (new Date(subscription.endDate) <= new Date() || subscription.remainingSessions <= 0) {
      subscription.status = 'expired';
    } else if (subscription.remainingSessions <= 2) {
      subscription.status = 'almost_expired';
    } else {
      subscription.status = 'active';
    }
    await subscription.save();
    await createAuditLog({ userId: req.user._id, action: 'update subscription', entity: 'Subscription', entityId: subscription._id, req });
    res.json(subscription);
  } catch (error) {
    next(error);
  }
};

const deleteSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid subscription ID.' });
    }
    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found.' });
    }

    const player = await Player.findById(subscription.playerId);
    if (player && player.subscriptionId?.toString() === subscription._id.toString()) {
      player.subscriptionId = undefined;
      await player.save();
    }

    await Subscription.deleteOne({ _id: subscription._id });
    await createAuditLog({ userId: req.user._id, action: 'delete subscription', entity: 'Subscription', entityId: subscription._id, req });
    res.json({ message: 'Subscription deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSubscriptions, createSubscription, updateSubscription, deleteSubscription };
