const { isDatabaseUnavailable } = require('../utils/databaseAvailability');

const errorHandler = (err, req, res, next) => {
  if (isDatabaseUnavailable(err)) {
    console.error('Database unavailable:', err.name, err.code || '');
    return res.status(503).json({ message: 'Database connection is temporarily unavailable. Please try again shortly.' });
  }
  if (err.code === 11000) return res.status(409).json({ message: 'This record already exists. Refresh and try again.' });
  if (err.name === 'VersionError') return res.status(409).json({ message: 'This record changed while you were editing. Refresh before saving again.' });
  const statusCode = err.statusCode || (['ValidationError', 'CastError'].includes(err.name) ? 400 : 500);
  const response = {
    message: err.message || 'Server Error'
  };
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }
  res.status(statusCode).json(response);
};

module.exports = errorHandler;
