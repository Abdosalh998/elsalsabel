const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * Customer totals are maintained manually in the Customers module.
 * Balances module only adds manual transactions.
 */

/**
 * GET /api/balances/customer-summary
 * Returns one row per customer with aggregated totals (for Card View)
 */
const getCustomerSummary = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { customer_ids, search, dateFrom, dateTo } = req.query;

    let custWhere = 'WHERE c.branch_id = $1 AND c.is_active = true';
    const custParams = [branch_id];
    let custIndex = 2;

    if (search) {
      custWhere += ` AND c.name ILIKE $${custIndex}`;
      custParams.push(`%${search}%`);
      custIndex++;
    }

    if (customer_ids) {
      const ids = Array.isArray(customer_ids) ? customer_ids : customer_ids.split(',');
      custWhere += ` AND c.id = ANY($${custIndex}::int[])`;
      custParams.push(ids.map(Number));
      custIndex++;
    }

    // Date filter on balances join
    let balanceJoinFilter = 'b.customer_id = c.id AND b.branch_id = $1';
    if (dateFrom && dateTo) {
      balanceJoinFilter += ` AND b.date BETWEEN $${custIndex} AND $${custIndex + 1}`;
      custParams.push(dateFrom, dateTo);
      custIndex += 2;
    } else if (dateFrom) {
      balanceJoinFilter += ` AND b.date >= $${custIndex}`;
      custParams.push(dateFrom);
      custIndex++;
    } else if (dateTo) {
      balanceJoinFilter += ` AND b.date <= $${custIndex}`;
      custParams.push(dateTo);
      custIndex++;
    }

    const finalQuery = `
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        COALESCE(SUM(b.invoice_amount), 0) AS total_invoiced,
        COALESCE(SUM(b.paid_amount), 0) AS total_paid,
        -- Gross live debt and credit from customers table
        COALESCE(c.customer_total, 0) AS customer_debt,
        COALESCE(c.total_payments, 0) AS customer_credit,
        -- Net live debt and credit from customers table
        CASE WHEN c.customer_total > c.total_payments THEN (c.customer_total - c.total_payments) ELSE 0 END AS total_debt,
        CASE WHEN c.total_payments > c.customer_total THEN (c.total_payments - c.customer_total) ELSE 0 END AS total_credit,
        COUNT(b.id) AS transactions_count,
        MAX(b.date) AS last_transaction_date
      FROM customers c
      LEFT JOIN customer_balances b ON ${balanceJoinFilter}
      ${custWhere}
      GROUP BY c.id, c.name, c.phone, c.customer_total, c.total_payments
      ORDER BY 
        CASE WHEN (c.customer_total - c.total_payments) > 0 THEN (c.customer_total - c.total_payments) ELSE 0 END DESC,
        c.name ASC
    `;

    const result = await pool.query(finalQuery, custParams);

    // Overall summary across active customers
    const summaryQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN c.customer_total > c.total_payments THEN (c.customer_total - c.total_payments) ELSE 0 END), 0) AS grand_total_debt,
        COALESCE(SUM(CASE WHEN c.total_payments > c.customer_total THEN (c.total_payments - c.customer_total) ELSE 0 END), 0) AS grand_total_credit,
        COUNT(DISTINCT c.id) FILTER (WHERE c.customer_total > 0 OR c.total_payments > 0) AS customers_with_transactions
      FROM customers c
      WHERE c.branch_id = $1 AND c.is_active = true
    `;
    const summaryResult = await pool.query(summaryQuery, [branch_id]);

    return sendSuccess(res, {
      customers: result.rows,
      summary: summaryResult.rows[0],
      total: result.rows.length
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/balances/customer/:customerId/transactions
 * Returns all transactions for a specific customer
 */
const getCustomerTransactions = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { customerId } = req.params;
    const { dateFrom, dateTo } = req.query;

    let whereClause = 'WHERE b.branch_id = $1 AND b.customer_id = $2';
    const params = [branch_id, customerId];
    let paramIndex = 3;

    if (dateFrom && dateTo) {
      whereClause += ` AND b.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      whereClause += ` AND b.date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      whereClause += ` AND b.date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    const result = await pool.query(`
      SELECT b.*, c.name as customer_name
      FROM customer_balances b
      JOIN customers c ON c.id = b.customer_id
      ${whereClause}
      ORDER BY b.date DESC, b.created_at DESC
    `, params);

    // Customer summary totals
    const totalsRes = await pool.query(`
      SELECT
        c.name as customer_name,
        c.phone as customer_phone,
        COALESCE(SUM(b.invoice_amount), 0) AS total_invoiced,
        COALESCE(SUM(b.paid_amount), 0) AS total_paid,
        COALESCE(c.customer_total, 0) AS customer_debt,
        COALESCE(c.total_payments, 0) AS customer_credit,
        CASE WHEN c.customer_total > c.total_payments THEN (c.customer_total - c.total_payments) ELSE 0 END AS total_debt,
        CASE WHEN c.total_payments > c.customer_total THEN (c.total_payments - c.customer_total) ELSE 0 END AS total_credit,
        COUNT(b.id) AS transactions_count
      FROM customers c
      LEFT JOIN customer_balances b ON b.customer_id = c.id AND b.branch_id = $1
      WHERE c.id = $2
      GROUP BY c.id, c.name, c.phone, c.customer_total, c.total_payments
    `, [branch_id, customerId]);

    return sendSuccess(res, {
      transactions: result.rows,
      customerInfo: totalsRes.rows[0] || null,
      total: result.rows.length
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/balances
 */
const getBalances = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { customer_id, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = `
      SELECT b.*, c.name as customer_name
      FROM customer_balances b
      JOIN customers c ON c.id = b.customer_id
      WHERE b.branch_id = $1
    `;
    const params = [branch_id];
    let paramIndex = 2;

    if (customer_id) {
      query += ` AND b.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND b.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      query += ` AND b.date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      query += ` AND b.date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ` ORDER BY b.date DESC, b.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    // Count query
    let countQuery = `
      SELECT COUNT(*) FROM customer_balances b 
      JOIN customers c ON c.id = b.customer_id 
      WHERE b.branch_id = $1`;
    const countParams = [branch_id];
    let countIndex = 2;

    if (customer_id) {
      countQuery += ` AND b.customer_id = $${countIndex}`;
      countParams.push(customer_id);
      countIndex++;
    }

    if (dateFrom && dateTo) {
      countQuery += ` AND b.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      countParams.push(dateFrom, dateTo);
      countIndex += 2;
    } else if (dateFrom) {
      countQuery += ` AND b.date >= $${countIndex}`;
      countParams.push(dateFrom);
      countIndex++;
    } else if (dateTo) {
      countQuery += ` AND b.date <= $${countIndex}`;
      countParams.push(dateTo);
      countIndex++;
    }

    const countResult = await pool.query(countQuery, countParams);

    return sendSuccess(res, {
      balances: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/balances
 */
const addBalance = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    let { customer_id, customer_name, date, invoice_amount = 0, paid_amount = 0, notes = '' } = req.body;

    if (!date) return sendError(res, 'التاريخ مطلوب');
    if (!customer_id && !customer_name) return sendError(res, 'يجب تحديد أو كتابة اسم العميل');

    // Create customer if it doesn't exist
    if (!customer_id) {
      const custRes = await client.query(
        `INSERT INTO customers (branch_id, name) VALUES ($1, $2) RETURNING id`,
        [branch_id, customer_name]
      );
      customer_id = custRes.rows[0].id;
    }

    // Logic for remaining and credit
    let remaining_balance = 0;
    let customer_credit = 0;
    if (paid_amount < invoice_amount) {
      remaining_balance = invoice_amount - paid_amount;
    } else if (paid_amount > invoice_amount) {
      customer_credit = paid_amount - invoice_amount;
    }

    const result = await client.query(
      `INSERT INTO customer_balances 
       (branch_id, date, customer_id, invoice_amount, paid_amount, remaining_balance, customer_credit, source_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8) RETURNING *`,
      [branch_id, date, customer_id, invoice_amount, paid_amount, remaining_balance, customer_credit, notes]
    );

    // Removed updateCustomerTotals call as per requirement

    await client.query('COMMIT');
    return sendSuccess(res, result.rows[0], 201, 'تم إضافة الرصيد بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/balances/:id
 */
const updateBalance = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const { date, invoice_amount = 0, paid_amount = 0, notes = '' } = req.body;

    const existing = await client.query(`SELECT customer_id FROM customer_balances WHERE id = $1 AND branch_id = $2`, [id, branch_id]);
    if (existing.rows.length === 0) throw new Error('الرصيد غير موجود');
    const customer_id = existing.rows[0].customer_id;

    let remaining_balance = 0;
    let customer_credit = 0;
    if (paid_amount < invoice_amount) {
      remaining_balance = invoice_amount - paid_amount;
    } else if (paid_amount > invoice_amount) {
      customer_credit = paid_amount - invoice_amount;
    }

    const result = await client.query(
      `UPDATE customer_balances 
       SET date = COALESCE($1, date), 
           invoice_amount = $2, 
           paid_amount = $3, 
           remaining_balance = $4, 
           customer_credit = $5, 
           notes = COALESCE($6, notes),
           updated_at = NOW()
       WHERE id = $7 AND branch_id = $8 RETURNING *`,
      [date, invoice_amount, paid_amount, remaining_balance, customer_credit, notes, id, branch_id]
    );

    // Removed updateCustomerTotals call as per requirement

    await client.query('COMMIT');
    return sendSuccess(res, result.rows[0], 200, 'تم تحديث الرصيد بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message === 'الرصيد غير موجود') return sendError(res, err.message, 404);
    next(err);
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/balances/:id
 */
const deleteBalance = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM customer_balances WHERE id = $1 AND branch_id = $2 RETURNING id`,
      [id, branch_id]
    );

    if (!result.rows[0]) return sendError(res, 'الرصيد غير موجود', 404);

    return sendSuccess(res, null, 200, 'تم حذف الرصيد بنجاح');
  } catch (err) {
    next(err);
  }
};

module.exports = { getBalances, addBalance, updateBalance, deleteBalance, getCustomerSummary, getCustomerTransactions };
