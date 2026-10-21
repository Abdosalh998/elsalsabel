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
      // Treasury net = all treasury entries - expenses - purchases treasury_balance
      pool.query(`SELECT 
        COALESCE(SUM(t.amount), 0) - 
        COALESCE((SELECT SUM(e.amount) FROM expenses e), 0) - 
        COALESCE((SELECT SUM(p.treasury_balance) FROM purchases p), 0) as net
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
    const { page = 1, limit = 50, dateFrom, dateTo } = req.query;
    const { offset } = paginate(page, limit);
    let where = `WHERE s.branch_id = $1`;
    const params = [branchId];
    let idx = 2;
    if (dateFrom) { where += ` AND s.date >= $${idx++}`; params.push(dateFrom); }
    if (dateTo)   { where += ` AND s.date <= $${idx++}`; params.push(dateTo); }
    const result = await pool.query(
      `SELECT s.*, c.name as customer_name, i.product FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN inventory i ON i.id = s.inventory_id
       ${where} ORDER BY s.date DESC, s.id DESC LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limit, offset]
    );
    const count = await pool.query(`SELECT COUNT(*) FROM sales s ${where}`, params);
    return sendSuccess(res, { sales: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { next(err); }
};

const getBranchTreasury = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    // Treasury records (payments received)
    const tRes = await pool.query(
      `SELECT id, date, amount, notes, 'treasury' as source, created_at FROM treasury WHERE branch_id=$1 ORDER BY date DESC, id DESC`,
      [branchId]
    );
    // Expenses (money out)
    const eRes = await pool.query(
      `SELECT id, date, amount, description as notes, 'expense' as source, created_at FROM expenses WHERE branch_id=$1`,
      [branchId]
    );
    // Purchases paid from treasury
    const pRes = await pool.query(
      `SELECT id, date, treasury_balance as amount, CONCAT('مشتريات: ', product) as notes, 'purchase' as source, created_at FROM purchases WHERE branch_id=$1 AND treasury_balance > 0`,
      [branchId]
    );

    const totalIn = tRes.rows.reduce((s, r) => s + Number(r.amount), 0);
    const totalOut = eRes.rows.reduce((s, r) => s + Number(r.amount), 0)
      + pRes.rows.reduce((s, r) => s + Number(r.amount), 0);

    return sendSuccess(res, {
      records: tRes.rows,
      expenses: eRes.rows,
      purchases: pRes.rows,
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
    const { page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);
    const result = await pool.query(
      `SELECT id, name, phone, customer_total, total_payments,
              (customer_total - total_payments) as remaining_balance
       FROM customers WHERE branch_id=$1 AND is_active=true
       ORDER BY name ASC LIMIT $2 OFFSET $3`,
      [branchId, limit, offset]
    );
    const count = await pool.query(`SELECT COUNT(*) FROM customers WHERE branch_id=$1 AND is_active=true`, [branchId]);
    return sendSuccess(res, { customers: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { next(err); }
};

const getBranchPurchases = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);
    const result = await pool.query(
      `SELECT p.*, c.name as supplier_name FROM purchases p
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE p.branch_id=$1 ORDER BY p.date DESC, p.id DESC LIMIT $2 OFFSET $3`,
      [branchId, limit, offset]
    );
    const count = await pool.query(`SELECT COUNT(*) FROM purchases WHERE branch_id=$1`, [branchId]);
    return sendSuccess(res, { purchases: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { next(err); }
};

const getBranchExpenses = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);
    const result = await pool.query(
      `SELECT * FROM expenses WHERE branch_id=$1 ORDER BY date DESC, id DESC LIMIT $2 OFFSET $3`,
      [branchId, limit, offset]
    );
    const count = await pool.query(`SELECT COUNT(*) FROM expenses WHERE branch_id=$1`, [branchId]);
    return sendSuccess(res, { expenses: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { next(err); }
};

const getBranchInventory = async (req, res, next) => {
  try {
    const { branchId } = req.params;
    const result = await pool.query(
      `SELECT * FROM inventory WHERE branch_id=$1 ORDER BY date DESC, id DESC`,
      [branchId]
    );
    return sendSuccess(res, { inventory: result.rows });
  } catch (err) { next(err); }
};

module.exports = {
  getBranches, addBranch, updateBranch, deleteBranch,
  getUsers, addUser, updateUser, deleteUser,
  getAdminStats,
  getBranchSales, getBranchTreasury, getBranchCustomers,
  getBranchPurchases, getBranchExpenses, getBranchInventory,
};
