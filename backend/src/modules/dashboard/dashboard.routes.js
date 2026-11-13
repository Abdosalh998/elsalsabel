const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { sendSuccess } = require('../../utils/helpers');

/**
 * GET /api/dashboard/stats
 * Returns key statistics for the branch dashboard
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const { branch_id } = req.user;

    const [
      customersRes,
      inventoryRes,
      salesRes,
      expensesRes,
      purchasesRes,
      treasuryRes,
      recentSalesRes,
      lowStockRes
    ] = await Promise.all([
      // Total active customers
      pool.query(`SELECT COUNT(*) as count FROM customers WHERE branch_id = $1 AND is_active = true`, [branch_id]),

      // Total inventory items & available weight
      pool.query(`
        SELECT COUNT(*) as items_count,
               COALESCE(SUM(available_quantity), 0) as total_available_weight,
               COALESCE(SUM(count), 0) as total_rolls
        FROM inventory WHERE branch_id = $1
      `, [branch_id]),

      // Sales stats (current month)
      pool.query(`
        SELECT COUNT(*) as invoices_count,
               COALESCE(SUM(total), 0) as total_sales,
               COALESCE(SUM(paid_amount), 0) as total_collected,
               COALESCE(SUM(remaining_balance), 0) as total_remaining
        FROM sales
        WHERE branch_id = $1
          AND date >= date_trunc('month', CURRENT_DATE)
      `, [branch_id]),

      // Expenses (current month)
      pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses WHERE branch_id = $1
          AND date >= date_trunc('month', CURRENT_DATE)
      `, [branch_id]),

      // Purchases (current month)
      pool.query(`
        SELECT COALESCE(SUM(total), 0) as total_purchases
        FROM purchases WHERE branch_id = $1
          AND date >= date_trunc('month', CURRENT_DATE)
      `, [branch_id]),

      // Treasury current balance (all time in - all time out)
      pool.query(`
        SELECT
          (SELECT COALESCE(SUM(amount), 0) FROM treasury WHERE branch_id = $1) -
          (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE branch_id = $1) -
          (SELECT COALESCE(SUM(treasury_balance), 0) FROM purchases WHERE branch_id = $1)
          as current_balance
      `, [branch_id]),

      // Last 5 sales invoices
      pool.query(`
        SELECT s.invoice_number, s.date, s.total, s.paid_amount, s.remaining_balance, c.name as customer_name
        FROM sales s
        JOIN customers c ON c.id = s.customer_id
        WHERE s.branch_id = $1
        ORDER BY s.created_at DESC
        LIMIT 5
      `, [branch_id]),

      // Low stock items (available < 20% of original)
      pool.query(`
        SELECT id, product, weight_quantity, available_quantity
        FROM inventory
        WHERE branch_id = $1
          AND weight_quantity > 0
          AND available_quantity <= (weight_quantity * 0.2)
        ORDER BY available_quantity ASC
        LIMIT 5
      `, [branch_id])
    ]);

    return sendSuccess(res, {
      customers:   { count: parseInt(customersRes.rows[0].count) },
      inventory:   {
        items_count:            parseInt(inventoryRes.rows[0].items_count),
        total_available_weight: parseFloat(inventoryRes.rows[0].total_available_weight),
        total_rolls:            parseInt(inventoryRes.rows[0].total_rolls)
      },
      sales: {
        invoices_count:  parseInt(salesRes.rows[0].invoices_count),
        total_sales:     parseFloat(salesRes.rows[0].total_sales),
        total_collected: parseFloat(salesRes.rows[0].total_collected),
        total_remaining: parseFloat(salesRes.rows[0].total_remaining)
      },
      expenses:  { total_expenses:  parseFloat(expensesRes.rows[0].total_expenses) },
      purchases: { total_purchases: parseFloat(purchasesRes.rows[0].total_purchases) },
      treasury:  { current_balance: parseFloat(treasuryRes.rows[0].current_balance) },
      recent_sales: recentSalesRes.rows,
      low_stock:    lowStockRes.rows
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
