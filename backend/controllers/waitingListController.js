const WaitingListEntry = require('../models/WaitingListEntry');
const TrainingGroup = require('../models/TrainingGroup');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const populateWaitingListEntry = (query) => query
  .populate('desiredGroupId', 'name days startTime endTime currentCount maxCapacity color')
  .populate('createdBy', 'name');

const getWaitingListEntries = async (req, res, next) => {
  try {
    const entries = await populateWaitingListEntry(
      WaitingListEntry.find().sort({ createdAt: -1, _id: -1 })
    );
    res.json(entries);
  } catch (error) {
    next(error);
  }
};

const createWaitingListEntry = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { playerName, parentName, parentPhone, desiredGroupId, notes } = payload;

    if (!playerName || !parentName || !parentPhone || !validateObjectId(desiredGroupId)) {
      return res.status(400).json({ message: 'Player name, parent name, parent phone, and desired group are required.' });
    }

    const group = await TrainingGroup.findById(desiredGroupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    const entry = await WaitingListEntry.create({
      playerName,
      parentName,
      parentPhone,
      desiredGroupId,
      notes: notes || '',
      createdBy: req.user._id
    });
    await createAuditLog({ userId: req.user._id, action: 'create waiting list entry', entity: 'WaitingListEntry', entityId: entry._id, req });

    const populatedEntry = await populateWaitingListEntry(WaitingListEntry.findById(entry._id));
    res.status(201).json(populatedEntry);
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

module.exports = { getWaitingListEntries, createWaitingListEntry, deleteWaitingListEntry };
