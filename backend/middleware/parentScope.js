const Parent = require('../models/Parent');
const Player = require('../models/Player');

// Apply ownership before query-string filters so a parent cannot widen the scope.
const parentScope = async (req, res, next) => {
  if (req.user?.role !== 'parent') return next();
  try {
    const parent = await Parent.findOne({ userId: req.user._id }).select('_id').lean();
    const players = parent ? await Player.find({ parentId: parent._id, isDeleted: { $ne: true } })
      .select('_id groupId groupIds').lean() : [];
    req.parentScope = {
      parentId: parent?._id || null,
      playerIds: players.map((player) => player._id),
      groupIds: players.flatMap((player) => [...(player.groupIds || []), player.groupId].filter(Boolean))
    };
    const playerId = req.params.playerId || (req.baseUrl.endsWith('/players') ? req.params.id : null);
    if (playerId && !players.some((player) => String(player._id) === String(playerId))) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { parentScope };
