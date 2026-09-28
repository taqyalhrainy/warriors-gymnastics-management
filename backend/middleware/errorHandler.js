const { isDatabaseUnavailable } = require('../utils/databaseAvailability');

const errorHandler = (err, req, res, next) => {
  if (isDatabaseUnavailable(err)) {
    console.error('Database unavailable:', err.name, err.code || '');
    return res.status(503).json({ message: 'Database connection is temporarily unavailable. Please try again shortly.' });
  }
  const statusCode = err.statusCode || 500;
  const response = {
    message: err.message || 'Server Error'
  };
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }
  res.status(statusCode).json(response);
};

module.exports = errorHandler;
