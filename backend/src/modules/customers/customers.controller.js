const pool = require('../../config/db');
const { sendSuccess, sendError, paginate, getEffectiveBranchId } = require('../../utils/helpers');

/**
 * GET /api/customers
 * Get all customers with search and pagination
 */
const getCustomers = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { name, phone, balance_type, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = `
      SELECT id, name, phone, total_payments, customer_total, created_at,
             total_payments as current_credit,
             (customer_total - total_payments) as remaining_balance
      FROM customers
      WHERE is_active = true
    `;
    const params = [];
    let paramIndex = 1;

    if (branch_id) {
      query += ` AND branch_id = $${paramIndex}`;
      params.push(branch_id);
      paramIndex++;
    }

    if (name) {
      const values = name.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        query += ` AND name ILIKE $${paramIndex}`;
        params.push(`%${values[0]}%`);
        paramIndex++;
      } else {
        query += ` AND name = ANY($${paramIndex}::text[])`;
        params.push(values);
        paramIndex++;
      }
    }

    if (phone) {
      const values = phone.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        query += ` AND phone ILIKE $${paramIndex}`;
        params.push(`%${values[0]}%`);
        paramIndex++;
      } else {
        query += ` AND phone = ANY($${paramIndex}::text[])`;
        params.push(values);
        paramIndex++;
      }
    }

    // balance_type: 'debtor' = (customer_total - total_payments) > 0
    //               'creditor' = (customer_total - total_payments) < 0
    //               'zero'    = (customer_total - total_payments) = 0
    if (balance_type === 'debtor') {
      query += ` AND (customer_total - total_payments) > 0`;
    } else if (balance_type === 'creditor') {
      query += ` AND (customer_total - total_payments) < 0`;
    } else if (balance_type === 'zero') {
      query += ` AND (customer_total - total_payments) = 0`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM customers WHERE is_active = true`;
    const countParams = [];
    let countIndex = 1;

    if (branch_id) {
      countQuery += ` AND branch_id = $${countIndex}`;
      countParams.push(branch_id);
      countIndex++;
    }

    if (name) {
      const values = name.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        countQuery += ` AND name ILIKE $${countIndex}`;
        countParams.push(`%${values[0]}%`);
        countIndex++;
      } else {
        countQuery += ` AND name = ANY($${countIndex}::text[])`;
        countParams.push(values);
        countIndex++;
      }
    }

    if (phone) {
      const values = phone.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        countQuery += ` AND phone ILIKE $${countIndex}`;
        countParams.push(`%${values[0]}%`);
        countIndex++;
      } else {
        countQuery += ` AND phone = ANY($${countIndex}::text[])`;
        countParams.push(values);
        countIndex++;
      }
    }

    if (balance_type === 'debtor') {
      countQuery += ` AND (customer_total - total_payments) > 0`;
    } else if (balance_type === 'creditor') {
      countQuery += ` AND (customer_total - total_payments) < 0`;
    } else if (balance_type === 'zero') {
      countQuery += ` AND (customer_total - total_payments) = 0`;
    }

    const countResult = await pool.query(countQuery, countParams);

    return sendSuccess(res, {
      customers: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/customers
 * Add a new customer
 */
const addCustomer = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { name, phone } = req.body;

    if (!name) return sendError(res, 'اسم العميل مطلوب');

    const result = await pool.query(
      `INSERT INTO customers (branch_id, name, phone, total_payments, customer_total)
       VALUES ($1, $2, $3, 0, 0) RETURNING *`,
      [branch_id, name, phone || null]
    );

    return sendSuccess(res, result.rows[0], 201, 'تم إضافة العميل بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/customers/:id
 * Edit customer details
 */
const updateCustomer = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;
    const { name, phone } = req.body;

    const result = await pool.query(
      `UPDATE customers 
       SET name = COALESCE($1, name), 
           phone = COALESCE($2, phone), 
           updated_at = NOW()
       WHERE id = $3 AND branch_id = $4 RETURNING *`,
      [name, phone, id, branch_id]
    );

    if (!result.rows[0]) return sendError(res, 'العميل غير موجود', 404);

    return sendSuccess(res, result.rows[0], 200, 'تم تحديث بيانات العميل بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/customers/:id
 * Soft delete customer (Admin only check is in middleware)
 */
const deleteCustomer = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    // Check if customer has balances or invoices before deleting to ensure data integrity
    const hasTransactions = await pool.query(
      `SELECT id FROM sales WHERE customer_id = $1 LIMIT 1`,
      [id]
    );

    if (hasTransactions.rows.length > 0) {
      return sendError(res, 'لا يمكن حذف عميل لديه حركات سابقة (فواتير / أرصدة).', 400);
    }

    const result = await pool.query(
      `UPDATE customers SET is_active = false WHERE id = $1 AND branch_id = $2 RETURNING id`,
      [id, branch_id]
    );

    if (!result.rows[0]) return sendError(res, 'العميل غير موجود', 404);

    return sendSuccess(res, null, 200, 'تم حذف العميل بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/customers/unique
 */
const getUniqueValues = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const whereBranch = branch_id ? `WHERE branch_id = $1 AND is_active = true` : `WHERE is_active = true`;
    const params = branch_id ? [branch_id] : [];

    const namesRes = await pool.query(
      `SELECT DISTINCT name FROM customers ${whereBranch} AND name IS NOT NULL ORDER BY name`,
      params
    );

    const phonesRes = await pool.query(
      `SELECT DISTINCT phone FROM customers ${whereBranch} AND phone IS NOT NULL AND phone != '' ORDER BY phone`,
      params
    );

    return sendSuccess(res, {
      names: namesRes.rows.map(r => r.name),
      phones: phonesRes.rows.map(r => r.phone)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/customers/:id/outstanding
 * Get all outstanding (unpaid/partially-paid) invoices for a customer
 */
const getOutstandingInvoices = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    let query = `
      SELECT 
         s.id,
         s.invoice_number,
         s.date,
         s.unit_price,
         s.quantity,
         s.total AS invoice_amount,
         s.paid_amount,
         s.remaining_balance AS remaining,
         s.notes
       FROM sales s
       WHERE s.customer_id = $1 
         AND s.remaining_balance > 0
    `;
    const params = [id];
    if (branch_id) {
      query += ` AND s.branch_id = $2`;
      params.push(branch_id);
    }
    query += ` ORDER BY s.date ASC, s.id ASC`;

    const result = await pool.query(query, params);

    const custRes = await pool.query(
      `SELECT total_payments, customer_total FROM customers WHERE id = $1`,
      [id]
    );
    const currentCredit = custRes.rows[0] ? Number(custRes.rows[0].total_payments || 0) : 0;
    const currentTotalDebt = custRes.rows[0] ? Number(custRes.rows[0].customer_total || 0) : 0;

    const totalInvoiceDebt = result.rows.reduce((sum, r) => sum + Number(r.remaining), 0);

    return sendSuccess(res, {
      invoices: result.rows,
      total_debt: totalInvoiceDebt || currentTotalDebt,
      current_credit: currentCredit,
      current_debt: currentTotalDebt || totalInvoiceDebt,
      current_balance: currentCredit - currentTotalDebt,
      unpaid_invoices_count: result.rows.length
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/customers/:id/adjust-balance
 * Adjust customer balance directly (credit [له] or debit [عليه])
 */
const adjustCustomerBalance = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const { type, amount, reason, date } = req.body;

    if (!type || !['credit', 'debit'].includes(type)) {
      return sendError(res, 'نوع التعديل غير صحيح. يجب أن يكون credit (له) أو debit (عليه)', 400);
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return sendError(res, 'يجب إدخال مبلغ صحيح أكبر من الصفر', 400);
    }

    const custCheck = await client.query(
      `SELECT * FROM customers WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
      [id, branch_id]
    );

    if (!custCheck.rows.length) {
      return sendError(res, 'العميل غير موجود', 404);
    }

    const adjDate = date || new Date().toISOString().split('T')[0];

    // Record the adjustment
    const adjRes = await client.query(
      `INSERT INTO customer_balance_adjustments
        (branch_id, customer_id, date, type, amount, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [branch_id, id, adjDate, type, numAmount, reason || '']
    );

    // Record in customer_balances ledger so it appears in statement of account (كشف الحساب)
    const ledgerNotes = reason
      ? `تسوية حساب: ${reason}`
      : (type === 'credit' ? 'تسوية رصيد لصالح العميل' : 'تسوية مديونية على العميل');

    await client.query(
      `INSERT INTO customer_balances
       (branch_id, date, customer_id, invoice_amount, paid_amount, remaining_balance, customer_credit, source_type, source_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'adjustment', $8, $9)`,
      [
        branch_id,
        adjDate,
        id,
        type === 'debit' ? numAmount : 0,
        type === 'credit' ? numAmount : 0,
        type === 'debit' ? numAmount : 0,
        0,
        adjRes.rows[0].id,
        ledgerNotes
      ]
    );

    // Update customer balance:
    // credit (له) -> increase total_payments
    // debit (عليه) -> increase customer_total
    let updateQuery = '';
    if (type === 'credit') {
      updateQuery = `
        UPDATE customers
        SET total_payments = total_payments + $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *, total_payments as current_credit, (customer_total - total_payments) as remaining_balance
      `;
    } else {
      updateQuery = `
        UPDATE customers
        SET customer_total = customer_total + $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *, total_payments as current_credit, (customer_total - total_payments) as remaining_balance
      `;
    }

    const updatedCust = await client.query(updateQuery, [numAmount, id]);

    await client.query('COMMIT');

    const msg = type === 'credit'
      ? `تمت إضافة رصيد ${numAmount.toFixed(2)} ج.م لصالح العميل بنجاح`
      : `تمت إضافة مديونية ${numAmount.toFixed(2)} ج.م على العميل بنجاح`;

    return sendSuccess(res, {
      customer: updatedCust.rows[0],
      adjustment: adjRes.rows[0]
    }, 200, msg);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/customers/:id/balance-history
 * Get customer balance adjustments history
 */
const getCustomerBalanceHistory = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM customer_balance_adjustments
       WHERE customer_id = $1 AND branch_id = $2
       ORDER BY date DESC, id DESC`,
      [id, branch_id]
    );

    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  getUniqueValues,
  getOutstandingInvoices,
  adjustCustomerBalance,
  getCustomerBalanceHistory,
};

