const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/helpers');
const pool = require('../config/db');

/**
 * Middleware: Verify JWT and attach user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'غير مصرح. يرجى تسجيل الدخول.', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB to ensure still active
    const result = await pool.query(
      'SELECT id, username, role, branch_id, full_name, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!result.rows[0] || !result.rows[0].is_active) {
      return sendError(res, 'المستخدم غير موجود أو غير نشط.', 401);
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.', 401);
    }
    return sendError(res, 'رمز المصادقة غير صالح.', 401);
  }
};

/**
 * Middleware: Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return sendError(res, 'هذه العملية تتطلب صلاحيات المدير.', 403);
  }
  next();
};

/**
 * Middleware: Ensure branch user can only access their own branch data
 * Admin can access any branch.
 */
const requireBranchAccess = (req, res, next) => {
  const { branchId } = req.params;
  if (req.user.role === 'admin') return next();
  if (parseInt(branchId) !== req.user.branch_id) {
    return sendError(res, 'ليس لديك صلاحية الوصول لهذا الفرع.', 403);
  }
  next();
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'حدث خطأ داخلي في الخادم.';
  return sendError(res, message, statusCode);
};

const authorizeAdmin = requireAdmin;
module.exports = { authenticate, requireAdmin, authorizeAdmin, requireBranchAccess, errorHandler };
