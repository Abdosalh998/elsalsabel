const pool = require('../../config/db');
const { sendSuccess, sendError, paginate, getEffectiveBranchId } = require('../../utils/helpers');
const { getCurrentTreasuryBalance } = require('../treasury/treasury.controller');

/**
 * GET /api/expenses
 */
const getExpenses = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { description, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = branch_id ? `SELECT * FROM expenses WHERE branch_id = $1` : `SELECT * FROM expenses WHERE 1=1`;
    const params = branch_id ? [branch_id] : [];
    let paramIndex = params.length + 1;

    let countQuery = branch_id ? `SELECT COUNT(*) FROM expenses WHERE branch_id = $1` : `SELECT COUNT(*) FROM expenses WHERE 1=1`;
    const countParams = branch_id ? [branch_id] : [];
    let countIndex = countParams.length + 1;

    if (description) {
      const values = description.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        query += ` AND description ILIKE $${paramIndex}`;
        countQuery += ` AND description ILIKE $${countIndex}`;
        params.push(`%${values[0]}%`);
        countParams.push(`%${values[0]}%`);
        paramIndex++;
        countIndex++;
      } else {
        query += ` AND description = ANY($${paramIndex}::text[])`;
        countQuery += ` AND description = ANY($${countIndex}::text[])`;
        params.push(values);
        countParams.push(values);
        paramIndex++;
        countIndex++;
      }
    }

    if (dateFrom && dateTo) {
      query += ` AND date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      countQuery += ` AND date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      params.push(dateFrom, dateTo);
      countParams.push(dateFrom, dateTo);
      paramIndex += 2;
      countIndex += 2;
    } else if (dateFrom) {
      query += ` AND date >= $${paramIndex}`;
      countQuery += ` AND date >= $${countIndex}`;
      params.push(dateFrom);
      countParams.push(dateFrom);
      paramIndex++;
      countIndex++;
    } else if (dateTo) {
      query += ` AND date <= $${paramIndex}`;
      countQuery += ` AND date <= $${countIndex}`;
      params.push(dateTo);
      countParams.push(dateTo);
      paramIndex++;
      countIndex++;
    }

    query += ` ORDER BY date DESC, id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
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
    let { date, description, amount, notes = '', override_reason = '', recipient_name = '', channel = 'cash', items = [], receipt_image = null } = req.body;

    let expenseAmount = Number(amount || 0);

    // If multi-item expenses provided
    if (Array.isArray(items) && items.length > 0) {
      expenseAmount = items.reduce((s, it) => s + Number(it.amount || 0), 0);
      if (!description) {
        description = items.map(it => it.description).filter(Boolean).join(' + ');
      }
    }

    if (!date || (!description && (!items || items.length === 0)) || expenseAmount <= 0) {
      return sendError(res, 'التاريخ، البند، والمبلغ مطلوبة بشكل صحيح');
    }

    const balanceInfo = await getCurrentTreasuryBalance(branch_id);
    const currentBalance = typeof balanceInfo === 'object' && balanceInfo !== null
      ? Number(balanceInfo.total || 0)
      : Number(balanceInfo || 0);

    if (expenseAmount > currentBalance && !override_reason) {
      return res.status(400).json({
        success: false,
        requiresOverride: true,
        message: `رصيد الخزينة الحالي (${currentBalance.toFixed(2)}) غير كافٍ. يرجى كتابة سبب التجاوز للمتابعة.`
      });
    }

    const newBalance = currentBalance - expenseAmount;

    const result = await pool.query(
      `INSERT INTO expenses (branch_id, date, description, amount, treasury_balance_before, treasury_balance_after, notes, override_reason, recipient_name, channel, items, receipt_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        branch_id, date, description, expenseAmount, currentBalance, newBalance, notes,
        override_reason || null, recipient_name || null, channel || 'cash', JSON.stringify(items || []), receipt_image || null
      ]
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
    let { date, description, amount, notes = '', override_reason = '', recipient_name = '', channel = 'cash', items = [], receipt_image = null } = req.body;

    const existing = await pool.query(`SELECT amount FROM expenses WHERE id = $1 AND branch_id = $2`, [id, branch_id]);
    if (existing.rows.length === 0) return sendError(res, 'المصروف غير موجود', 404);
    
    let newAmount = Number(amount || 0);
    if (Array.isArray(items) && items.length > 0) {
      newAmount = items.reduce((s, it) => s + Number(it.amount || 0), 0);
      if (!description) {
        description = items.map(it => it.description).filter(Boolean).join(' + ');
      }
    }

    const oldAmount = Number(existing.rows[0].amount);
    
    if (newAmount > oldAmount) {
      const balanceInfo = await getCurrentTreasuryBalance(branch_id);
      const currentBalance = typeof balanceInfo === 'object' && balanceInfo !== null
        ? Number(balanceInfo.total || 0)
        : Number(balanceInfo || 0);
      const diff = newAmount - oldAmount;
      if (diff > currentBalance && !override_reason) {
        return res.status(400).json({
          success: false,
          requiresOverride: true,
          message: `تعديل المصروف بالزيادة يتطلب رصيد غير متاح (${diff.toFixed(2)}). يرجى كتابة سبب التجاوز.`
        });
      }
    }

    const result = await pool.query(
      `UPDATE expenses 
       SET date = $1, description = $2, amount = $3, notes = $4, override_reason = COALESCE($5, override_reason),
           recipient_name = $6, channel = $7, items = $8, receipt_image = $9, updated_at = NOW()
       WHERE id = $10 AND branch_id = $11 RETURNING *`,
      [
        date, description, newAmount, notes, override_reason || null,
        recipient_name || null, channel || 'cash', JSON.stringify(items || []),
        receipt_image || null, id, branch_id
      ]
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
    const branch_id = getEffectiveBranchId(req);
    const whereBranch = branch_id ? `WHERE branch_id = $1 AND` : `WHERE`;
    const params = branch_id ? [branch_id] : [];
    
    const descRes = await pool.query(
      `SELECT DISTINCT description FROM expenses ${whereBranch} description IS NOT NULL AND description != '' ORDER BY description`,
      params
    );

    return sendSuccess(res, {
      descriptions: descRes.rows.map(r => r.description)
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getExpenses, addExpense, updateExpense, deleteExpense, getUniqueValues };
