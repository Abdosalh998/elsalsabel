const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../../config/db');
const { sendSuccess, sendError, signToken } = require('../../utils/helpers');

/**
 * POST /api/auth/login
 */
const login = [
  body('username').trim().notEmpty().withMessage('اسم المستخدم مطلوب.'),
  body('password').notEmpty().withMessage('كلمة المرور مطلوبة.'),

  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendError(res, 'بيانات غير صالحة.', 422, errors.array());
      }

      const { username, password } = req.body;

      // Find user
      const result = await pool.query(
        `SELECT u.id, u.username, u.password_hash, u.role, u.branch_id, u.full_name, u.is_active,
                b.name as branch_name, b.code as branch_code
         FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
         WHERE u.username = $1`,
        [username]
      );

      const user = result.rows[0];
      if (!user || !user.is_active) {
        return sendError(res, 'اسم المستخدم أو كلمة المرور غير صحيحة.', 401);
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return sendError(res, 'اسم المستخدم أو كلمة المرور غير صحيحة.', 401);
      }

      // Sign token
      const token = signToken({
        id: user.id,
        role: user.role,
        branch_id: user.branch_id,
      });

      const userData = {
        id: user.id,
        username: user.username,
        role: user.role,
        branch_id: user.branch_id,
        branch_name: user.branch_name,
        branch_code: user.branch_code,
        full_name: user.full_name,
      };

      return sendSuccess(res, { token, user: userData }, 200, 'تم تسجيل الدخول بنجاح.');
    } catch (err) {
      next(err);
    }
  },
];

/**
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.branch_id, u.full_name,
              b.name as branch_name, b.code as branch_code
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    return sendSuccess(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
};

module.exports = { login, getMe };
