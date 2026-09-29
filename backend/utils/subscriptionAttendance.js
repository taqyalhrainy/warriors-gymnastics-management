const Attendance = require('../models/Attendance');
const Subscription = require('../models/Subscription');
const { getAppDateKey, getAppDateOnly } = require('./appDate');

const synchronizeSubscriptionAttendanceUsage = async (player, today = new Date()) => {
  if (!player?._id) return;
  const subscription = player.subscriptionId
    ? await Subscription.findOne({ _id: player.subscriptionId?._id || player.subscriptionId, playerId: player._id })
    : await Subscription.findOne({ playerId: player._id });
  if (!subscription || subscription.type !== 'sessions') return;

  const cycleStartValue = player.currentSubscriptionStartedAt || player.startDate || subscription.startDate;
  const cycleStart = cycleStartValue ? new Date(cycleStartValue) : null;
  const normalizedCycleStart = cycleStart && !Number.isNaN(cycleStart.getTime()) ? getAppDateOnly(cycleStart) : null;

  const explicitlyCountedIds = new Set((player.currentSubscriptionAttendanceIds || []).map(String));
  const explicitlyExcludedIds = new Set((player.currentSubscriptionExcludedAttendanceIds || []).map(String));
  const presentRecords = await Attendance.find({
    playerId: player._id,
    status: 'present'
  }).select('_id date').lean();
  const countedDates = new Set();
  let latestAttendanceDate = null;

  presentRecords.forEach((record) => {
    if (explicitlyExcludedIds.has(String(record._id))) return;

    const recordDate = getAppDateOnly(record.date);
    const isInCurrentCycle = !normalizedCycleStart
      || recordDate >= normalizedCycleStart
      || explicitlyCountedIds.has(String(record._id));
    if (!isInCurrentCycle) return;

    countedDates.add(recordDate.toISOString().split('T')[0]);
    if (!latestAttendanceDate || recordDate > latestAttendanceDate) {
      latestAttendanceDate = recordDate;
    }
  });

  const totalSessions = Math.max(0, Number(subscription.totalSessions || 0));
  subscription.usedSessions = totalSessions
    ? Math.min(totalSessions, countedDates.size)
    : countedDates.size;
  subscription.remainingSessions = totalSessions
    ? Math.max(0, totalSessions - subscription.usedSessions)
    : Math.max(0, Number(subscription.remainingSessions || 0));
  subscription.lastAttendanceDate = latestAttendanceDate || undefined;

  if ((subscription.endDate && getAppDateKey(subscription.endDate) <= getAppDateKey(today)) || (totalSessions > 0 && subscription.remainingSessions === 0)) {
    subscription.status = 'expired';
  } else if (totalSessions > 0 && subscription.remainingSessions <= 2) {
    subscription.status = 'almost_expired';
  } else {
    subscription.status = 'active';
  }
  await subscription.save();
};

module.exports = { synchronizeSubscriptionAttendanceUsage };
