const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');
const { getCurrentTreasuryBalance } = require('../treasury/treasury.controller');

/**
 * GET /api/expenses
 */
const getExpenses = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { description, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = `SELECT * FROM expenses WHERE branch_id = $1`;
    const params = [branch_id];
    let paramIndex = 2;

    if (description) {
      query += ` AND description ILIKE $${paramIndex}`;
      params.push(`%${description}%`);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      query += ` AND date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      query += ` AND date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ` ORDER BY date DESC, id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    let countQuery = `SELECT COUNT(*) FROM expenses WHERE branch_id = $1`;
    const countParams = [branch_id];
    let countIndex = 2;

    if (description) {
      countQuery += ` AND description ILIKE $${countIndex}`;
      countParams.push(`%${description}%`);
      countIndex++;
    }

    if (dateFrom && dateTo) {
      countQuery += ` AND date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      countParams.push(dateFrom, dateTo);
      countIndex += 2;
    } else if (dateFrom) {
      countQuery += ` AND date >= $${countIndex}`;
      countParams.push(dateFrom);
      countIndex++;
    } else if (dateTo) {
      countQuery += ` AND date <= $${countIndex}`;
      countParams.push(dateTo);
      countIndex++;
    }

    const countResult = await pool.query(countQuery, countParams);

    return sendSuccess(res, {
      expenses: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/expenses
 */
const addExpense = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { date, description, amount, notes = '', override_reason = '' } = req.body;

    if (!date || !description || !amount) return sendError(res, 'التاريخ، الوصف، والمبلغ مطلوبة');
    const expenseAmount = Number(amount);

    const currentBalance = await getCurrentTreasuryBalance(branch_id);

    if (expenseAmount > currentBalance && !override_reason) {
      return res.status(400).json({
        success: false,
        requiresOverride: true,
        message: `رصيد الخزينة الحالي (${currentBalance}) غير كافٍ. يرجى كتابة سبب التجاوز للمتابعة.`
      });
    }

    const newBalance = currentBalance - expenseAmount;

    const result = await pool.query(
      `INSERT INTO expenses (branch_id, date, description, amount, treasury_balance_before, treasury_balance_after, notes, override_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [branch_id, date, description, expenseAmount, currentBalance, newBalance, notes, override_reason]
    );

    return sendSuccess(res, result.rows[0], 201, 'تم تسجيل المصروف بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/expenses/:id
 */
const updateExpense = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;
    const { date, description, amount, notes = '', override_reason = '' } = req.body;

    // Editing expenses is complex if we strictly trace treasury_balance_after historically, 
    // but the system calculates global balance dynamically anyway.
    // We will still validate the new amount against the global current balance if it increases.
    
    const existing = await pool.query(`SELECT amount FROM expenses WHERE id = $1 AND branch_id = $2`, [id, branch_id]);
    if (existing.rows.length === 0) return sendError(res, 'المصروف غير موجود', 404);
    
    const oldAmount = Number(existing.rows[0].amount);
    const newAmount = Number(amount);
    
    if (newAmount > oldAmount) {
      const currentBalance = await getCurrentTreasuryBalance(branch_id);
      const diff = newAmount - oldAmount;
      if (diff > currentBalance && !override_reason) {
        return res.status(400).json({
          success: false,
          requiresOverride: true,
          message: `تعديل المصروف بالزيادة يتطلب رصيد غير متاح (${diff}). يرجى كتابة سبب التجاوز.`
        });
      }
    }

    const result = await pool.query(
      `UPDATE expenses 
       SET date = $1, description = $2, amount = $3, notes = $4, override_reason = COALESCE($5, override_reason), updated_at = NOW()
       WHERE id = $6 AND branch_id = $7 RETURNING *`,
      [date, description, newAmount, notes, override_reason || null, id, branch_id]
    );

    return sendSuccess(res, result.rows[0], 200, 'تم تحديث المصروف بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/expenses/:id
 */
const deleteExpense = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM expenses WHERE id = $1 AND branch_id = $2 RETURNING id`,
      [id, branch_id]
    );

    if (!result.rows[0]) return sendError(res, 'المصروف غير موجود', 404);

    return sendSuccess(res, null, 200, 'تم حذف المصروف بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/expenses/unique
 */
const getUniqueValues = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    
    const descRes = await pool.query(
      `SELECT DISTINCT description FROM expenses WHERE branch_id = $1 AND description IS NOT NULL AND description != '' ORDER BY description`,
      [branch_id]
    );

    return sendSuccess(res, {
      descriptions: descRes.rows.map(r => r.description)
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getExpenses, addExpense, updateExpense, deleteExpense, getUniqueValues };
