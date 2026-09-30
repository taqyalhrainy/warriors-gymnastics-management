const Subscription = require('../models/Subscription');
const Player = require('../models/Player');
const Program = require('../models/Program');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { parseLocalizedNumber } = require('../utils/numberInput');
const { getAppDateKey, dateKeyToUtc } = require('../utils/appDate');
const { synchronizeSubscriptionAttendanceUsage } = require('../utils/subscriptionAttendance');

const daysBetweenDateKeys = (first, second) => Math.ceil((dateKeyToUtc(first) - dateKeyToUtc(second)) / 86400000);

const applySubscriptionToPlayer = async (player, subscription, { resetCycle = false } = {}) => {
  if (!player) return;
  player.subscriptionId = subscription._id;
  player.packageName = subscription.packageName || '';
  player.packageClasses = subscription.type === 'sessions' ? Number(subscription.totalSessions || 0) : 0;
  player.payment = Number(subscription.price || 0);
  player.startDate = subscription.startDate;
  player.endDate = subscription.endDate;
  if (resetCycle) {
    player.currentSubscriptionStartedAt = subscription.startDate;
    player.currentSubscriptionAttendanceIds = [];
    player.currentSubscriptionExcludedAttendanceIds = [];
  }
  if (subscription.status !== 'expired' && player.status === 'expired') player.status = 'active';
  await player.save();
};

const getSubscriptions = async (req, res, next) => {
  try {
    const filter = {};
    if (req.parentScope) filter.$and = [{ playerId: { $in: req.parentScope.playerIds } }];
    if (req.query.playerId && validateObjectId(req.query.playerId)) {
      filter.playerId = req.query.playerId;
    }
    const subscriptions = await Subscription.find(filter).sort({ startDate: -1, _id: -1 }).populate('playerId', 'fullName');
    const populated = subscriptions.map((subscription) => {
      const sub = subscription.toObject();
      if (sub.type === 'time' && sub.endDate) {
        const todayKey = getAppDateKey();
        const endDateKey = getAppDateKey(sub.endDate);
        const daysRemaining = Math.max(0, daysBetweenDateKeys(endDateKey, todayKey));
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
    const remainingSessions = type === 'sessions' ? parseLocalizedNumber(totalSessions) : 0;
    let subscription = await Subscription.findOne({ playerId });
    if (subscription) {
      Object.assign(subscription, {
        type,
        packageName: program.name,
        totalSessions: parseLocalizedNumber(totalSessions),
        usedSessions: 0,
        remainingSessions,
        startDate,
        endDate,
        price: parseLocalizedNumber(program.price ?? price),
        status: 'active',
        lastAttendanceDate: undefined
      });
      await subscription.save();
    } else {
      subscription = await Subscription.create({
        playerId,
        type,
        packageName: program.name,
        totalSessions: parseLocalizedNumber(totalSessions),
        usedSessions: 0,
        remainingSessions,
        startDate,
        endDate,
        price: parseLocalizedNumber(program.price ?? price),
        status: 'active'
      });
    }
    await applySubscriptionToPlayer(player, subscription, { resetCycle: true });
    await synchronizeSubscriptionAttendanceUsage(player);
    await createAuditLog({ userId: req.user._id, action: 'create subscription', entity: 'Subscription', entityId: subscription._id, req });
    res.status(201).json(await Subscription.findById(subscription._id));
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
    const previousStartDate = subscription.startDate ? new Date(subscription.startDate).getTime() : null;
    // Ownership and derived usage cannot be changed by an edit form.
    for (const key of ['type', 'packageName', 'startDate', 'endDate']) {
      if (payload[key] !== undefined) subscription[key] = payload[key];
    }
    if (payload.totalSessions !== undefined) {
      subscription.totalSessions = parseLocalizedNumber(payload.totalSessions);
    }
    if (payload.price !== undefined) {
      subscription.price = parseLocalizedNumber(payload.price);
    }
    if (subscription.type === 'sessions') {
      subscription.remainingSessions = Math.max(0, subscription.totalSessions - subscription.usedSessions);
    }
    const sessionsExhausted = subscription.type === 'sessions'
      && subscription.totalSessions > 0
      && subscription.remainingSessions <= 0;
    if (getAppDateKey(subscription.endDate) <= getAppDateKey() || sessionsExhausted) {
      subscription.status = 'expired';
    } else if (subscription.type === 'sessions' && subscription.totalSessions > 0 && subscription.remainingSessions <= 2) {
      subscription.status = 'almost_expired';
    } else {
      subscription.status = 'active';
    }
    await subscription.save();
    const player = await Player.findById(subscription.playerId);
    const nextStartDate = subscription.startDate ? new Date(subscription.startDate).getTime() : null;
    await applySubscriptionToPlayer(player, subscription, { resetCycle: previousStartDate !== nextStartDate });
    await synchronizeSubscriptionAttendanceUsage(player);
    await createAuditLog({ userId: req.user._id, action: 'update subscription', entity: 'Subscription', entityId: subscription._id, req });
    res.json(await Subscription.findById(subscription._id));
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
