const pool = require('../../config/db');
const bcrypt = require('bcryptjs');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

// ─── BRANCHES ────────────────────────────────────────────────────────────────

const getBranches = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT b.id, b.name, b.code, b.address, b.is_active, b.created_at,
        (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.is_active = true) as user_count,
        COALESCE((SELECT SUM(t.amount) FROM treasury t WHERE t.branch_id = b.id), 0)
          - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = b.id), 0)
          - COALESCE((SELECT SUM(p.treasury_balance) FROM purchases p WHERE p.branch_id = b.id), 0)
          - COALESCE((SELECT SUM(trf_out.amount) FROM transfers trf_out WHERE trf_out.from_branch_id = b.id AND trf_out.type = 'monetary' AND trf_out.status IN ('pending', 'completed')), 0)
          + COALESCE((SELECT SUM(trf_in.amount) FROM transfers trf_in WHERE trf_in.to_branch_id = b.id AND trf_in.type = 'monetary' AND trf_in.status = 'completed'), 0)
          as treasury_total,
        (SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE s.branch_id = b.id) as sales_total,
        (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e WHERE e.branch_id = b.id) as expenses_total,
        (SELECT COALESCE(SUM(p.total), 0) FROM purchases p WHERE p.branch_id = b.id) as purchases_total
      FROM branches b
      ORDER BY b.id ASC
    `);
    return sendSuccess(res, { branches: result.rows });
  } catch (err) {
    next(err);
  }
};

const addBranch = async (req, res, next) => {
  try {
    const { name, code, address } = req.body;
    if (!name || !code) return sendError(res, 'الاسم والكود مطلوبان');
    const result = await pool.query(
      `INSERT INTO branches (name, code, address, is_active) VALUES ($1, $2, $3, true) RETURNING *`,
      [name.trim(), code.trim().toUpperCase(), address || '']
    );
    return sendSuccess(res, result.rows[0], 201, 'تم إنشاء الفرع بنجاح');
  } catch (err) {
    if (err.code === '23505') return sendError(res, 'كود الفرع مستخدم بالفعل', 409);
    next(err);
  }
};

const updateBranch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, address, is_active } = req.body;
    const result = await pool.query(
      `UPDATE branches SET name=$1, code=$2, address=$3, is_active=$4 WHERE id=$5 RETURNING *`,
      [name, code, address, is_active, id]
    );
    if (result.rows.length === 0) return sendError(res, 'الفرع غير موجود', 404);
    return sendSuccess(res, result.rows[0], 200, 'تم تحديث الفرع بنجاح');
  } catch (err) {
    next(err);
  }
};

const deleteBranch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hasUsers = await pool.query(`SELECT COUNT(*) FROM users WHERE branch_id=$1`, [id]);
    if (parseInt(hasUsers.rows[0].count) > 0)
      return sendError(res, 'لا يمكن حذف فرع له مستخدمون', 400);
    const result = await pool.query(`DELETE FROM branches WHERE id=$1 RETURNING id`, [id]);
    if (result.rows.length === 0) return sendError(res, 'الفرع غير موجود', 404);
    return sendSuccess(res, null, 200, 'تم حذف الفرع بنجاح');
  } catch (err) {
    next(err);
  }
};

// ─── USERS ───────────────────────────────────────────────────────────────────

const getUsers = async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at,
             b.name as branch_name, b.id as branch_id, b.code as branch_code
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      ORDER BY u.role ASC, u.id ASC
    `);
    return sendSuccess(res, { users: result.rows });
  } catch (err) {
    next(err);
  }
};

const addUser = async (req, res, next) => {
  try {
    const { username, full_name, password, role, branch_id } = req.body;
    if (!username || !password || !full_name || !role)
      return sendError(res, 'جميع الحقول مطلوبة');
    if (role === 'branch_user' && !branch_id)
      return sendError(res, 'يجب تحديد الفرع لمسؤول الفرع');
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const result = await pool.query(
      `INSERT INTO users (username, full_name, password_hash, role, branch_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id, username, full_name, role, branch_id, is_active`,
      [username.trim(), full_name.trim(), password_hash, role, branch_id || null]
    );
    return sendSuccess(res, result.rows[0], 201, 'تم إنشاء المستخدم بنجاح');
  } catch (err) {
    if (err.code === '23505') return sendError(res, 'اسم المستخدم مستخدم بالفعل', 409);
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, role, branch_id, is_active, password } = req.body;

    let password_hash;
    if (password && password.trim()) {
      const salt = await bcrypt.genSalt(10);
      password_hash = await bcrypt.hash(password, salt);
    }

    const result = await pool.query(
      `UPDATE users SET 
        full_name = $1,
        role = $2,
        branch_id = $3,
        is_active = $4
        ${password_hash ? ', password_hash = $6' : ''}
       WHERE id = $5 RETURNING id, username, full_name, role, branch_id, is_active`,
      password_hash
        ? [full_name, role, branch_id || null, is_active, id, password_hash]
        : [full_name, role, branch_id || null, is_active, id]
    );
    if (result.rows.length === 0) return sendError(res, 'المستخدم غير موجود', 404);
    return sendSuccess(res, result.rows[0], 200, 'تم تحديث المستخدم بنجاح');
  } catch (err) {
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.user.id === parseInt(id)) return sendError(res, 'لا يمكنك حذف حسابك الخاص', 400);
    const result = await pool.query(`DELETE FROM users WHERE id=$1 RETURNING id`, [id]);
    if (result.rows.length === 0) return sendError(res, 'المستخدم غير موجود', 404);
    return sendSuccess(res, null, 200, 'تم حذف المستخدم بنجاح');
  } catch (err) {
    next(err);
  }
};

// ─── CROSS-BRANCH STATS (Admin Dashboard KPIs) ───────────────────────────────

const getAdminStats = async (req, res, next) => {
  try {
    const [branches, salesRes, purchasesRes, expensesRes, treasuryRes, customersRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM branches WHERE is_active=true`),
      pool.query(`SELECT COALESCE(SUM(total), 0) as total FROM sales`),
      pool.query(`SELECT COALESCE(SUM(total), 0) as total FROM purchases`),
      pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses`),
      // Treasury net = all treasury entries - expenses - purchases treasury_balance - pending in-transit transfers
      pool.query(`SELECT 
        COALESCE(SUM(t.amount), 0) - 
        COALESCE((SELECT SUM(e.amount) FROM expenses e), 0) - 
        COALESCE((SELECT SUM(p.treasury_balance) FROM purchases p), 0) -
        COALESCE((SELECT SUM(trf.amount) FROM transfers trf WHERE trf.type = 'monetary' AND trf.status = 'pending'), 0) as net
        FROM treasury t`),
      pool.query(`SELECT COUNT(*) as count FROM customers WHERE is_active=true`),
    ]);

    return sendSuccess(res, {
      branches_count: parseInt(branches.rows[0].count),
      total_sales: parseFloat(salesRes.rows[0].total),
      total_purchases: parseFloat(purchasesRes.rows[0].total),
      total_expenses: parseFloat(expensesRes.rows[0].total),
      total_treasury: parseFloat(treasuryRes.rows[0].net),
      total_customers: parseInt(customersRes.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
};

// ─── VIEW BRANCH DATA (Admin reads any branch) ───────────────────────────────

const getBranchSales = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page = 1, limit = 100, dateFrom, dateTo, search } = req.query;
    const { offset } = paginate(page, limit);
    let where = `WHERE s.branch_id = $1`;
    const params = [branchId];
    let idx = 2;
    if (dateFrom) { where += ` AND s.date >= $${idx++}`; params.push(dateFrom); }
    if (dateTo) { where += ` AND s.date <= $${idx++}`; params.push(dateTo); }
    if (search) {
      where += ` AND (c.name ILIKE $${idx} OR i.product ILIKE $${idx} OR s.invoice_number::text ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    const result = await pool.query(
      `SELECT s.*, c.name as customer_name, i.product FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN inventory i ON i.id = s.inventory_id
       ${where} ORDER BY s.date DESC, s.id DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const statsRes = await pool.query(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(s.total), 0) as total_amount,
         COALESCE(SUM(s.paid_amount), 0) as total_paid,
         COALESCE(SUM(s.remaining_balance), 0) as total_remaining,
         COALESCE(SUM(s.settlement_amount), 0) as total_settlements
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN inventory i ON i.id = s.inventory_id
       ${where}`,
      params
    );

    return sendSuccess(res, {
      sales: result.rows,
      total: parseInt(statsRes.rows[0].count, 10),
      summary: {
        total_amount: parseFloat(statsRes.rows[0].total_amount),
        total_paid: parseFloat(statsRes.rows[0].total_paid),
        total_remaining: parseFloat(statsRes.rows[0].total_remaining),
        total_settlements: parseFloat(statsRes.rows[0].total_settlements),
      }
    });
  } catch (err) { next(err); }
};

const getBranchTreasury = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { dateFrom, dateTo } = req.query;

    let tDateWhere = '';
    let eDateWhere = '';
    let pDateWhere = '';
    let trfDateWhere = '';
    const dateParams = [];
    let pIdx = 2;

    if (dateFrom) {
      tDateWhere += ` AND date >= $${pIdx}`;
      eDateWhere += ` AND date >= $${pIdx}`;
      pDateWhere += ` AND date >= $${pIdx}`;
      trfDateWhere += ` AND t.created_at::date >= $${pIdx}`;
      dateParams.push(dateFrom);
      pIdx++;
    }
    if (dateTo) {
      tDateWhere += ` AND date <= $${pIdx}`;
      eDateWhere += ` AND date <= $${pIdx}`;
      pDateWhere += ` AND date <= $${pIdx}`;
      trfDateWhere += ` AND t.created_at::date <= $${pIdx}`;
      dateParams.push(dateTo);
      pIdx++;
    }

    // Treasury records (payments received)
    const tRes = await pool.query(
      `SELECT id, date, amount, notes, channel, 'treasury' as source, created_at FROM treasury WHERE branch_id=$1 ${tDateWhere} ORDER BY date DESC, id DESC`,
      [branchId, ...dateParams]
    );
    // Expenses (money out)
    const eRes = await pool.query(
      `SELECT id, date, amount, description as notes, channel, 'expense' as source, created_at FROM expenses WHERE branch_id=$1 ${eDateWhere}`,
      [branchId, ...dateParams]
    );
    // Purchases paid from treasury
    const pRes = await pool.query(
      `SELECT id, date, treasury_balance as amount, CONCAT('مشتريات: ', product) as notes, channel, 'purchase' as source, created_at FROM purchases WHERE branch_id=$1 AND treasury_balance > 0 ${pDateWhere}`,
      [branchId, ...dateParams]
    );

    // Outgoing monetary transfers
    const trfOutRes = await pool.query(
      `SELECT t.id, t.created_at as date, t.amount, CONCAT('تحويل صادر إلى فرع: ', to_b.name, ' - ', t.transfer_number) as notes, 'transfer_out' as source, t.created_at 
       FROM transfers t 
       JOIN branches to_b ON to_b.id = t.to_branch_id
       WHERE t.from_branch_id=$1 AND t.type='monetary' AND t.status IN ('pending', 'completed') ${trfDateWhere}`,
      [branchId, ...dateParams]
    );

    // Incoming monetary transfers
    const trfInRes = await pool.query(
      `SELECT t.id, t.created_at as date, t.amount, CONCAT('تحويل وارد من فرع: ', from_b.name, ' - ', t.transfer_number) as notes, 'transfer_in' as source, t.created_at 
       FROM transfers t 
       JOIN branches from_b ON from_b.id = t.from_branch_id
       WHERE t.to_branch_id=$1 AND t.type='monetary' AND t.status='completed' ${trfDateWhere}`,
      [branchId, ...dateParams]
    );

    const totalIn = tRes.rows.reduce((s, r) => s + Number(r.amount), 0)
      + trfInRes.rows.reduce((s, r) => s + Number(r.amount), 0);
    const totalOut = eRes.rows.reduce((s, r) => s + Number(r.amount), 0)
      + pRes.rows.reduce((s, r) => s + Number(r.amount), 0)
      + trfOutRes.rows.reduce((s, r) => s + Number(r.amount), 0);

    return sendSuccess(res, {
      records: tRes.rows,
      expenses: eRes.rows,
      purchases: pRes.rows,
      transfers_out: trfOutRes.rows,
      transfers_in: trfInRes.rows,
      totals: {
        total_in: totalIn,
        total_out: totalOut,
        net: totalIn - totalOut
      }
    });
  } catch (err) { next(err); }
};

const getBranchCustomers = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page = 1, limit = 100, search } = req.query;
    const { offset } = paginate(page, limit);
    let where = `WHERE branch_id=$1 AND is_active=true`;
    const params = [branchId];
    let idx = 2;
    if (search) {
      where += ` AND (name ILIKE $${idx} OR phone ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    const result = await pool.query(
      `SELECT id, name, phone, customer_total, total_payments,
              (customer_total - total_payments) as remaining_balance
       FROM customers ${where}
       ORDER BY (customer_total - total_payments) DESC, name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    const countRes = await pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(customer_total - total_payments), 0) as total_debt FROM customers ${where}`, params);
    return sendSuccess(res, {
      customers: result.rows,
      total: parseInt(countRes.rows[0].count, 10),
      total_debt: parseFloat(countRes.rows[0].total_debt)
    });
  } catch (err) { next(err); }
};

const getBranchPurchases = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page = 1, limit = 100, dateFrom, dateTo, search } = req.query;
    const { offset } = paginate(page, limit);
    let where = `WHERE p.branch_id=$1`;
    const params = [branchId];
    let idx = 2;
    if (dateFrom) { where += ` AND p.date >= $${idx++}`; params.push(dateFrom); }
    if (dateTo) { where += ` AND p.date <= $${idx++}`; params.push(dateTo); }
    if (search) {
      where += ` AND (p.product ILIKE $${idx} OR c.name ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    const result = await pool.query(
      `SELECT p.*, c.name as supplier_name FROM purchases p
       LEFT JOIN customers c ON c.id = p.customer_id
       ${where} ORDER BY p.date DESC, p.id DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    const countRes = await pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(p.total), 0) as total_amount FROM purchases p LEFT JOIN customers c ON c.id = p.customer_id ${where}`, params);
    return sendSuccess(res, {
      purchases: result.rows,
      total: parseInt(countRes.rows[0].count, 10),
      summary: { total_amount: parseFloat(countRes.rows[0].total_amount) }
    });
  } catch (err) { next(err); }
};

const getBranchExpenses = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page = 1, limit = 100, dateFrom, dateTo, search } = req.query;
    const { offset } = paginate(page, limit);
    let where = `WHERE branch_id=$1`;
    const params = [branchId];
    let idx = 2;
    if (dateFrom) { where += ` AND date >= $${idx++}`; params.push(dateFrom); }
    if (dateTo) { where += ` AND date <= $${idx++}`; params.push(dateTo); }
    if (search) {
      where += ` AND (description ILIKE $${idx} OR notes ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    const result = await pool.query(
      `SELECT * FROM expenses ${where} ORDER BY date DESC, id DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    const countRes = await pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount FROM expenses ${where}`, params);
    return sendSuccess(res, {
      expenses: result.rows,
      total: parseInt(countRes.rows[0].count, 10),
      summary: { total_amount: parseFloat(countRes.rows[0].total_amount) }
    });
  } catch (err) { next(err); }
};

const getBranchInventory = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { search, available_only } = req.query;
    let where = `WHERE branch_id=$1`;
    const params = [branchId];
    let idx = 2;
    if (search) {
      where += ` AND (product ILIKE $${idx} OR company ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }
    if (available_only === 'true') {
      where += ` AND (weight_quantity - COALESCE(issued_quantity, 0)) > 0`;
    }

    const result = await pool.query(
      `SELECT *,
         COALESCE(weight_quantity - COALESCE(issued_quantity, 0), 0) as available_weight,
         COALESCE(count - COALESCE(issued_rolls, 0), 0) as available_rolls
       FROM inventory ${where} ORDER BY date DESC, id DESC`,
      params
    );

    const statsRes = await pool.query(
      `SELECT 
         COUNT(*) as total_items,
         COALESCE(SUM(weight_quantity), 0) as total_weight,
         COALESCE(SUM(weight_quantity - COALESCE(issued_quantity, 0)), 0) as total_available_weight,
         COALESCE(SUM(total), 0) as total_inventory_value
       FROM inventory ${where}`,
      params
    );

    return sendSuccess(res, {
      inventory: result.rows,
      summary: {
        total_items: parseInt(statsRes.rows[0].total_items, 10),
        total_weight: parseFloat(statsRes.rows[0].total_weight),
        total_available_weight: parseFloat(statsRes.rows[0].total_available_weight),
        total_inventory_value: parseFloat(statsRes.rows[0].total_inventory_value),
      }
    });
  } catch (err) { next(err); }
};

// ─── NEW MONITORING MODULES FOR BRANCH ───────────────────────────────────────

const getBranchColoring = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { dateFrom, dateTo, search, status } = req.query;
    let where = `WHERE branch_id=$1`;
    const params = [branchId];
    let idx = 2;
    if (dateFrom) { where += ` AND date >= $${idx++}`; params.push(dateFrom); }
    if (dateTo) { where += ` AND date <= $${idx++}`; params.push(dateTo); }
    if (status) { where += ` AND status = $${idx++}`; params.push(status); }
    if (search) {
      where += ` AND (product ILIKE $${idx} OR colored_product ILIKE $${idx} OR order_number ILIKE $${idx} OR color ILIKE $${idx} OR coloring_company ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    const result = await pool.query(
      `SELECT * FROM coloring_orders ${where} ORDER BY date DESC, id DESC`,
      params
    );

    const summaryRes = await pool.query(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(issued_weight), 0) as total_issued_weight,
         COALESCE(SUM(returned_weight), 0) as total_returned_weight,
         COALESCE(SUM(weight_gain), 0) as total_gain,
         COALESCE(SUM(coloring_cost), 0) as total_cost
       FROM coloring_orders ${where}`,
      params
    );

    return sendSuccess(res, {
      coloring: result.rows,
      summary: {
        count: parseInt(summaryRes.rows[0].count, 10),
        total_issued_weight: parseFloat(summaryRes.rows[0].total_issued_weight),
        total_returned_weight: parseFloat(summaryRes.rows[0].total_returned_weight),
        total_gain: parseFloat(summaryRes.rows[0].total_gain),
        total_cost: parseFloat(summaryRes.rows[0].total_cost),
      }
    });
  } catch (err) { next(err); }
};

const getBranchCustody = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { search, type, dateFrom, dateTo } = req.query;

    let where = `WHERE c.branch_id = $1`;
    const params = [branchId];
    let idx = 2;
    if (dateFrom) { where += ` AND c.date >= $${idx++}`; params.push(dateFrom); }
    if (dateTo)   { where += ` AND c.date <= $${idx++}`; params.push(dateTo); }
    if (type)     { where += ` AND c.type = $${idx++}`; params.push(type); }
    if (search) {
      where += ` AND (c.person_name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.receipt_number ILIKE $${idx} OR c.notes ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    const result = await pool.query(
      `SELECT c.*, pt.name as payment_type_name
       FROM custodies c
       LEFT JOIN payment_types pt ON pt.id = c.payment_type_id
       ${where}
       ORDER BY c.date DESC, c.id DESC`,
      params
    );

    const summaryRes = await pool.query(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE 0 END), 0) as total_disbursed,
         COALESCE(SUM(CASE WHEN c.type = 'collection' THEN c.amount ELSE 0 END), 0) as total_collected
       FROM custodies c
       ${where}`,
      params
    );

    const totalDisbursed = parseFloat(summaryRes.rows[0].total_disbursed);
    const totalCollected = parseFloat(summaryRes.rows[0].total_collected);
    const totalRemaining = totalDisbursed - totalCollected;

    return sendSuccess(res, {
      custody: result.rows,
      summary: {
        count: parseInt(summaryRes.rows[0].count, 10),
        total_disbursed: totalDisbursed,
        total_collected: totalCollected,
        total_remaining: totalRemaining,
      }
    });
  } catch (err) { next(err); }
};

const getBranchTransfers = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { type, status } = req.query;
    let where = `WHERE (t.from_branch_id = $1 OR t.to_branch_id = $1)`;
    const params = [branchId];
    let idx = 2;
    if (type) { where += ` AND t.type = $${idx++}`; params.push(type); }
    if (status) { where += ` AND t.status = $${idx++}`; params.push(status); }

    const result = await pool.query(
      `SELECT t.*, 
         fb.name as from_branch_name,
         tb.name as to_branch_name
       FROM transfers t
       LEFT JOIN branches fb ON fb.id = t.from_branch_id
       LEFT JOIN branches tb ON tb.id = t.to_branch_id
       ${where}
       ORDER BY t.created_at DESC`,
      params
    );

    return sendSuccess(res, { transfers: result.rows });
  } catch (err) { next(err); }
};

const getBranchSummary = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { dateFrom, dateTo } = req.query;

    const bRes = await pool.query(`SELECT * FROM branches WHERE id = $1`, [branchId]);
    if (!bRes.rows.length) return sendError(res, 'الفرع غير موجود', 404);
    const branch = bRes.rows[0];

    let sWhere = 'WHERE branch_id = $1';
    let pWhere = 'WHERE branch_id = $1';
    let eWhere = 'WHERE branch_id = $1';
    const params = [branchId];
    let idx = 2;
    if (dateFrom) {
      sWhere += ` AND date >= $${idx}`;
      pWhere += ` AND date >= $${idx}`;
      eWhere += ` AND date >= $${idx}`;
      params.push(dateFrom);
      idx++;
    }
    if (dateTo) {
      sWhere += ` AND date <= $${idx}`;
      pWhere += ` AND date <= $${idx}`;
      eWhere += ` AND date <= $${idx}`;
      params.push(dateTo);
      idx++;
    }

    const [salesStats, purStats, expStats, debtStats, invStats, treasuryStats] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total, COALESCE(SUM(paid_amount), 0) as paid, COALESCE(SUM(remaining_balance), 0) as remaining FROM sales ${sWhere}`, params),
      pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM purchases ${pWhere}`, params),
      pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM expenses ${eWhere}`, params),
      pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(customer_total - total_payments), 0) as total_debt FROM customers WHERE branch_id = $1 AND is_active = true`, [branchId]),
      pool.query(`SELECT COUNT(*) as items_count, COALESCE(SUM(weight_quantity - COALESCE(issued_quantity, 0)), 0) as total_avail_w, COALESCE(SUM(total), 0) as total_val FROM inventory WHERE branch_id = $1`, [branchId]),
      pool.query(`
        SELECT 
          COALESCE((SELECT SUM(amount) FROM treasury WHERE branch_id = $1), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE branch_id = $1), 0)
          - COALESCE((SELECT SUM(treasury_balance) FROM purchases WHERE branch_id = $1), 0)
          - COALESCE((SELECT SUM(amount) FROM transfers WHERE from_branch_id = $1 AND type = 'monetary' AND status IN ('pending', 'completed')), 0)
          + COALESCE((SELECT SUM(amount) FROM transfers WHERE to_branch_id = $1 AND type = 'monetary' AND status = 'completed'), 0)
          as net_treasury
      `, [branchId])
    ]);

    const totalSales = parseFloat(salesStats.rows[0].total);
    const totalPurchases = parseFloat(purStats.rows[0].total);
    const totalExpenses = parseFloat(expStats.rows[0].total);
    const netProfitEst = totalSales - totalPurchases - totalExpenses;

    return sendSuccess(res, {
      branch,
      sales: {
        count: parseInt(salesStats.rows[0].count, 10),
        total: totalSales,
        paid: parseFloat(salesStats.rows[0].paid),
        remaining: parseFloat(salesStats.rows[0].remaining),
      },
      purchases: {
        count: parseInt(purStats.rows[0].count, 10),
        total: totalPurchases,
      },
      expenses: {
        count: parseInt(expStats.rows[0].count, 10),
        total: totalExpenses,
      },
      treasury: {
        net: parseFloat(treasuryStats.rows[0].net_treasury),
      },
      customers: {
        count: parseInt(debtStats.rows[0].count, 10),
        total_debt: parseFloat(debtStats.rows[0].total_debt),
      },
      inventory: {
        items_count: parseInt(invStats.rows[0].items_count, 10),
        total_avail_weight: parseFloat(invStats.rows[0].total_avail_w),
        total_value: parseFloat(invStats.rows[0].total_val),
      },
      net_profit_estimate: netProfitEst,
    });
  } catch (err) { next(err); }
};

module.exports = {
  getBranches, addBranch, updateBranch, deleteBranch,
  getUsers, addUser, updateUser, deleteUser,
  getAdminStats,
  getBranchSales, getBranchTreasury, getBranchCustomers,
  getBranchPurchases, getBranchExpenses, getBranchInventory,
  getBranchColoring, getBranchCustody, getBranchTransfers, getBranchSummary,
};
