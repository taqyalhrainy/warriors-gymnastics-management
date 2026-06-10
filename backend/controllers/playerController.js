const Player = require('../models/Player');
const Parent = require('../models/Parent');
const TrainingGroup = require('../models/TrainingGroup');
const Subscription = require('../models/Subscription');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');

const formatPlayerResponse = (player) => {
  const obj = player.toObject({ virtuals: true });
  if (obj.parentPhoneEncrypted) {
    try {
      obj.parentPhone = decrypt(obj.parentPhoneEncrypted);
    } catch (err) {
      obj.parentPhone = '';
    }
  }
  delete obj.parentPhoneEncrypted;
  return obj;
};

const getPlayers = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id });
      if (parent) {
        filter.parentId = parent._id;
      }
    }
    if (req.query.parentId && validateObjectId(req.query.parentId)) {
      filter.parentId = req.query.parentId;
    }
    const players = await Player.find(filter)
      .populate('parentId', 'name email')
      .populate('programId', 'name level')
      .populate('groupId', 'name days startTime endTime')
      .populate('coachId', 'name');
    res.json(players.map(formatPlayerResponse));
  } catch (error) {
    next(error);
  }
};

const createPlayer = async (req, res, next) => {
  try {
    const data = sanitizeObject(req.body);
    const { fullName, dateOfBirth, parentId, parentPhone, programId, groupId, coachId, level, profileImage, status = 'active' } = data;
    if (!fullName || !dateOfBirth || !parentId || !parentPhone) {
      return res.status(400).json({ message: 'Required player fields are missing.' });
    }
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }
    const payload = {
      fullName,
      dateOfBirth,
      parentId,
      parentPhoneEncrypted: encrypt(parentPhone),
      programId,
      groupId,
      coachId,
      level,
      status,
      profileImage: profileImage || ''
    };
    if (groupId) {
      const group = await TrainingGroup.findById(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found.' });
      }
      if (group.currentCount >= group.maxCapacity) {
        return res.status(400).json({ message: 'Group is already at full capacity.' });
      }
      group.currentCount += 1;
      await group.save();
    }
    const player = await Player.create(payload);
    parent.children.push(player._id);
    await parent.save();
    await createAuditLog({ userId: req.user._id, action: 'add player', entity: 'Player', entityId: player._id, req });
    res.status(201).json(formatPlayerResponse(player));
  } catch (error) {
    next(error);
  }
};

const getPlayerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const player = await Player.findById(id)
      .populate('parentId', 'name email')
      .populate('programId', 'name level')
      .populate('groupId', 'name days startTime endTime')
      .populate('coachId', 'name')
      .populate('subscriptionId', 'type status remainingSessions usedSessions startDate endDate price');
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const playerData = formatPlayerResponse(player);
    if (playerData.subscriptionId?.type === 'time' && playerData.subscriptionId.endDate) {
      const today = new Date();
      const endDate = new Date(playerData.subscriptionId.endDate);
      playerData.subscriptionId.daysRemaining = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
    }
    res.json(playerData);
  } catch (error) {
    next(error);
  }
};

const updatePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const updates = sanitizeObject(req.body);
    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    if (updates.groupId && updates.groupId !== String(player.groupId)) {
      const newGroup = await TrainingGroup.findById(updates.groupId);
      if (!newGroup) {
        return res.status(404).json({ message: 'New group not found.' });
      }
      if (newGroup.currentCount >= newGroup.maxCapacity) {
        return res.status(400).json({ message: 'New group is full.' });
      }
      if (player.groupId) {
        const oldGroup = await TrainingGroup.findById(player.groupId);
        if (oldGroup) {
          oldGroup.currentCount = Math.max(0, oldGroup.currentCount - 1);
          await oldGroup.save();
        }
      }
      newGroup.currentCount += 1;
      await newGroup.save();
    }
    if (updates.parentPhone) {
      updates.parentPhoneEncrypted = encrypt(updates.parentPhone);
      delete updates.parentPhone;
    }
    Object.assign(player, updates);
    await player.save();
    await createAuditLog({ userId: req.user._id, action: 'edit player', entity: 'Player', entityId: player._id, req });
    res.json(formatPlayerResponse(player));
  } catch (error) {
    next(error);
  }
};

const deletePlayer = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    if (player.groupId) {
      const group = await TrainingGroup.findById(player.groupId);
      if (group) {
        group.currentCount = Math.max(0, group.currentCount - 1);
        await group.save();
      }
    }
    const parent = await Parent.findById(player.parentId);
    if (parent) {
      parent.children = parent.children.filter((childId) => String(childId) !== String(player._id));
      await parent.save();
    }
    await player.deleteOne();
    await createAuditLog({ userId: req.user._id, action: 'delete player', entity: 'Player', entityId: player._id, req });
    res.json({ message: 'Player deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPlayers, createPlayer, getPlayerById, updatePlayer, deletePlayer };
