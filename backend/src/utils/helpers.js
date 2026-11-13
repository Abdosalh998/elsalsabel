const jwt = require('jsonwebtoken');

/**
 * Sends a standardized success response.
 * Handles both (res, data, statusCode, message) and (res, data, message, statusCode).
 */
const sendSuccess = (res, data, statusCode = 200, message = 'تمت العملية بنجاح') => {
  let finalStatus = statusCode;
  let finalMessage = message;

  if (typeof statusCode === 'string') {
    finalMessage = statusCode;
    finalStatus = typeof message === 'number' ? message : 200;
  }

  return res.status(finalStatus).json({
    success: true,
    message: finalMessage,
    data,
  });
};

/**
 * Sends a standardized error response.
 */
const sendError = (res, message, statusCode = 400, errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

/**
 * Signs a JWT token for the given payload.
 */
const signToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
};

/**
 * Paginates a query result.
 */
const paginate = (page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  return { limit, offset };
};

module.exports = { sendSuccess, sendError, signToken, paginate };
