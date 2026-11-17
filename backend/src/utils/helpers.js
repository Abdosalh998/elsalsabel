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

/**
 * Resolves effective branch_id for the current request.
 * - For branch_user: returns req.user.branch_id.
 * - For admin: returns req.query.branch_id/branchId, req.body.branch_id/branchId,
 *   req.params.branchId, or x-branch-id header if provided; else null.
 */
const getEffectiveBranchId = (req) => {
  if (req.user && req.user.role === 'admin') {
    const bId =
      req.query?.branch_id ||
      req.query?.branchId ||
      req.body?.branch_id ||
      req.body?.branchId ||
      req.params?.branchId ||
      req.headers?.['x-branch-id'];
    if (bId && bId !== 'all' && bId !== '0') {
      const parsed = parseInt(bId, 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }
  return req.user?.branch_id || null;
};

module.exports = { sendSuccess, sendError, signToken, paginate, getEffectiveBranchId };
