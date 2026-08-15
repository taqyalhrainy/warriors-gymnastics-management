const WaitingListEntry = require('../models/WaitingListEntry');
const TrainingGroup = require('../models/TrainingGroup');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const populateWaitingListEntry = (query) => query
  .populate('desiredGroupId', 'name days startTime endTime currentCount maxCapacity color')
  .populate('desiredGroupIds', 'name days startTime endTime currentCount maxCapacity color')
  .populate('createdBy', 'name');

const getWaitingListEntries = async (req, res, next) => {
  try {
    const entries = await populateWaitingListEntry(
      WaitingListEntry.find().sort({ createdAt: 1, _id: 1 })
    );
    res.json(entries);
  } catch (error) {
    next(error);
  }
};

const validateWaitingListPayload = async (payload) => {
  const { playerName, playerAge, parentName, parentPhone, desiredGroupId, notes } = payload;
  const listType = payload.listType === 'data' ? 'data' : 'waiting';
  const rawGroupIds = Array.isArray(payload.desiredGroupIds)
    ? payload.desiredGroupIds
    : [desiredGroupId].filter(Boolean);
  const desiredGroupIds = [...new Set(rawGroupIds.filter(validateObjectId).map(String))];

  const parsedPlayerAge = playerAge === '' || typeof playerAge === 'undefined' ? undefined : Number(playerAge);
  if (typeof parsedPlayerAge !== 'undefined' && (!Number.isFinite(parsedPlayerAge) || parsedPlayerAge < 0 || parsedPlayerAge > 120)) {
    return { error: { status: 400, message: 'Player age must be a valid number.' } };
  }

  if (desiredGroupIds.length) {
    const groups = await TrainingGroup.find({ _id: { $in: desiredGroupIds } });
    if (groups.length !== desiredGroupIds.length) {
      return { error: { status: 404, message: 'Group not found.' } };
    }
  }

  return {
    data: {
      playerName: playerName || '',
      playerAge: parsedPlayerAge,
      parentName: parentName || '',
      parentPhone: parentPhone || '',
      desiredGroupId: desiredGroupIds[0] || undefined,
      desiredGroupIds,
      listType,
      notes: notes || ''
    }
  };
};

const createWaitingListEntry = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { data, error } = await validateWaitingListPayload(payload);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const entry = await WaitingListEntry.create({
      ...data,
      createdBy: req.user._id
    });
    await createAuditLog({ userId: req.user._id, action: 'create waiting list entry', entity: 'WaitingListEntry', entityId: entry._id, req });

    const populatedEntry = await populateWaitingListEntry(WaitingListEntry.findById(entry._id));
    res.status(201).json(populatedEntry);
  } catch (error) {
    next(error);
  }
};

const updateWaitingListEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid waiting list entry ID.' });
    }

    const entry = await WaitingListEntry.findById(id);
    if (!entry) {
      return res.status(404).json({ message: 'Waiting list entry not found.' });
    }

    const payload = sanitizeObject(req.body);
    const { data, error } = await validateWaitingListPayload(payload);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    Object.assign(entry, data);
    await entry.save();
    await createAuditLog({ userId: req.user._id, action: 'update waiting list entry', entity: 'WaitingListEntry', entityId: entry._id, req });

    const populatedEntry = await populateWaitingListEntry(WaitingListEntry.findById(entry._id));
    res.json(populatedEntry);
  } catch (error) {
    next(error);
  }
};

const deleteWaitingListEntry = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid waiting list entry ID.' });
    }

    const entry = await WaitingListEntry.findById(id);
    if (!entry) {
      return res.status(404).json({ message: 'Waiting list entry not found.' });
    }

    await entry.deleteOne();
    await createAuditLog({ userId: req.user._id, action: 'delete waiting list entry', entity: 'WaitingListEntry', entityId: entry._id, req });
    res.json({ message: 'Waiting list entry deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getWaitingListEntries, createWaitingListEntry, updateWaitingListEntry, deleteWaitingListEntry };
