const { restoreStateAt, getHistoryAvailableSince } = require('../utils/history');

const getHistorySnapshot = async (req, res, next) => {
  try {
    const { entityType, at } = req.query;

    if (!['player', 'payment'].includes(entityType)) {
      return res.status(400).json({ message: 'History requires entityType=player or entityType=payment.' });
    }

    if (!at) {
      return res.status(400).json({ message: 'History requires a target date and time.' });
    }

    const asOf = new Date(at);
    if (Number.isNaN(asOf.getTime())) {
      return res.status(400).json({ message: 'Invalid history date/time.' });
    }

    const rows = await restoreStateAt(entityType, asOf);
    const availableSince = await getHistoryAvailableSince(entityType);
    res.json({
      entityType,
      asOf: asOf.toISOString(),
      availableSince: availableSince ? new Date(availableSince).toISOString() : null,
      count: rows.length,
      rows
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getHistorySnapshot };
