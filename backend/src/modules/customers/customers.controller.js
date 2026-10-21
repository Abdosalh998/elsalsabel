const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * GET /api/customers
 * Get all customers with search and pagination
 */
const getCustomers = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { name, phone, balance_type, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = `
      SELECT id, name, phone, total_payments, customer_total, created_at,
             (customer_total - total_payments) as remaining_balance
      FROM customers
      WHERE branch_id = $1 AND is_active = true
    `;
    const params = [branch_id];
    let paramIndex = 2;

    if (name) {
      query += ` AND name ILIKE $${paramIndex}`;
      params.push(`%${name}%`);
      paramIndex++;
    }

    if (phone) {
      query += ` AND phone ILIKE $${paramIndex}`;
      params.push(`%${phone}%`);
      paramIndex++;
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
    let countQuery = `SELECT COUNT(*) FROM customers WHERE branch_id = $1 AND is_active = true`;
    const countParams = [branch_id];
    let countIndex = 2;

    if (name) {
      countQuery += ` AND name ILIKE $${countIndex}`;
      countParams.push(`%${name}%`);
      countIndex++;
    }
    
    if (phone) {
      countQuery += ` AND phone ILIKE $${countIndex}`;
      countParams.push(`%${phone}%`);
      countIndex++;
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
    const { branch_id } = req.user;

    const namesRes = await pool.query(
      `SELECT DISTINCT name FROM customers WHERE branch_id = $1 AND is_active = true AND name IS NOT NULL ORDER BY name`,
      [branch_id]
    );

    const phonesRes = await pool.query(
      `SELECT DISTINCT phone FROM customers WHERE branch_id = $1 AND is_active = true AND phone IS NOT NULL AND phone != '' ORDER BY phone`,
      [branch_id]
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
    const { branch_id } = req.user;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
         s.invoice_number,
         s.date,
         s.unit_price,
         s.quantity,
         cb.invoice_amount,
         cb.paid_amount,
         (cb.invoice_amount - cb.paid_amount) AS remaining,
         s.notes
       FROM customer_balances cb
       JOIN sales s ON s.id = cb.source_id AND cb.source_type = 'sales'
       WHERE cb.customer_id = $1 
         AND cb.branch_id = $2
         AND (cb.invoice_amount - cb.paid_amount) > 0
       ORDER BY s.date ASC`,
      [id, branch_id]
    );

    const totalDebt = result.rows.reduce((sum, r) => sum + Number(r.remaining), 0);

    return sendSuccess(res, {
      invoices: result.rows,
      total_debt: totalDebt
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCustomers, addCustomer, updateCustomer, deleteCustomer, getUniqueValues, getOutstandingInvoices };

