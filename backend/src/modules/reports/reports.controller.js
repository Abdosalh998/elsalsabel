const pool = require('../../config/db');
const { sendSuccess, sendError } = require('../../utils/helpers');

/**
 * Helper to resolve branch_id (allows admin to inspect any branch)
 */
const resolveUserBranch = (req) => {
  if (req.user && req.user.role === 'admin' && req.query.branch_id && req.query.branch_id !== 'all') {
    return parseInt(req.query.branch_id, 10);
  }
  return req.user?.branch_id;
};

/**
 * Helper to get current treasury balance for a branch
 */
const getCurrentTreasuryBalance = async (branchId) => {
  const tRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_in FROM treasury WHERE branch_id = $1`, [branchId]);
  
  const tChannelRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'cash' THEN t.amount ELSE 0 END), 0) AS cash_in,
      COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'wallet' THEN t.amount ELSE 0 END), 0) AS wallet_in,
      COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'instapay' THEN t.amount ELSE 0 END), 0) AS instapay_in,
      COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'bank' THEN t.amount ELSE 0 END), 0) AS bank_in
    FROM treasury t
    LEFT JOIN payment_types pt ON pt.id = t.payment_type_id
    WHERE t.branch_id = $1
  `, [branchId]);

  const eRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_exp FROM expenses WHERE branch_id = $1`, [branchId]);
  const eChannelRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN amount ELSE 0 END), 0) AS cash_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN amount ELSE 0 END), 0) AS bank_out
    FROM expenses WHERE branch_id = $1
  `, [branchId]);

  const pRes = await pool.query(`SELECT COALESCE(SUM(treasury_balance), 0) as total_pur FROM purchases WHERE branch_id = $1`, [branchId]);
  const pChannelRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN treasury_balance ELSE 0 END), 0) AS cash_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN treasury_balance ELSE 0 END), 0) AS wallet_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN treasury_balance ELSE 0 END), 0) AS instapay_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN treasury_balance ELSE 0 END), 0) AS bank_pur
    FROM purchases WHERE branch_id = $1
  `, [branchId]);

  // Outgoing transfers
  const trfOutRes = await pool.query(`
    SELECT 
      COALESCE(SUM(amount), 0) as total_trf_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN amount ELSE 0 END), 0) AS cash_trf_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_trf_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_trf_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN amount ELSE 0 END), 0) AS bank_trf_out
    FROM transfers 
    WHERE from_branch_id = $1 AND type = 'monetary' AND status IN ('pending', 'completed')
  `, [branchId]);

  // Incoming completed transfers
  const trfInRes = await pool.query(`
    SELECT 
      COALESCE(SUM(amount), 0) as total_trf_in,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN amount ELSE 0 END), 0) AS cash_trf_in,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_trf_in,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_trf_in,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN amount ELSE 0 END), 0) AS bank_trf_in
    FROM transfers 
    WHERE to_branch_id = $1 AND type = 'monetary' AND status = 'completed'
  `, [branchId]);

  const totalIn = Number(tRes.rows[0].total_in) + Number(trfInRes.rows[0].total_trf_in);
  const totalExp = Number(eRes.rows[0].total_exp);
  const totalPur = Number(pRes.rows[0].total_pur);
  const totalTrfOut = Number(trfOutRes.rows[0].total_trf_out);
  const totalBalance = totalIn - totalExp - totalPur - totalTrfOut;

  const ch = tChannelRes.rows[0];
  const ec = eChannelRes.rows[0];
  const pc = pChannelRes.rows[0];
  const tout = trfOutRes.rows[0];
  const tin = trfInRes.rows[0];

  return {
    total: totalBalance,
    channels: {
      cash: Number(ch.cash_in) + Number(tin.cash_trf_in) - Number(ec.cash_out) - Number(pc.cash_pur) - Number(tout.cash_trf_out),
      wallet: Number(ch.wallet_in) + Number(tin.wallet_trf_in) - Number(ec.wallet_out) - Number(pc.wallet_pur) - Number(tout.wallet_trf_out),
      instapay: Number(ch.instapay_in) + Number(tin.instapay_trf_in) - Number(ec.instapay_out) - Number(pc.instapay_pur) - Number(tout.instapay_trf_out),
      bank: Number(ch.bank_in) + Number(tin.bank_trf_in) - Number(ec.bank_out) - Number(pc.bank_pur) - Number(tout.bank_trf_out)
    }
  };
};

/**
 * 1. Comprehensive Executive Report (التقرير الشامل العام للمركز المالي)
 * GET /api/reports/comprehensive?startDate=...&endDate=...
 */
const getComprehensiveReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate } = req.query;

    const dateFilterSales = [];
    const dateFilterPurchases = [];
    const dateFilterExpenses = [];
    const dateFilterTreasury = [];
    const dateFilterColoring = [];
    const dateFilterCustody = [];
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      dateFilterSales.push(`date >= $${pIdx}`);
      dateFilterPurchases.push(`date >= $${pIdx}`);
      dateFilterExpenses.push(`date >= $${pIdx}`);
      dateFilterTreasury.push(`date >= $${pIdx}`);
      dateFilterColoring.push(`date >= $${pIdx}`);
      dateFilterCustody.push(`date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }
    if (endDate) {
      dateFilterSales.push(`date <= $${pIdx}`);
      dateFilterPurchases.push(`date <= $${pIdx}`);
      dateFilterExpenses.push(`date <= $${pIdx}`);
      dateFilterTreasury.push(`date <= $${pIdx}`);
      dateFilterColoring.push(`date <= $${pIdx}`);
      dateFilterCustody.push(`date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }

    const sWhere = ['branch_id = $1', ...dateFilterSales].join(' AND ');
    const pWhere = ['branch_id = $1', ...dateFilterPurchases].join(' AND ');
    const eWhere = ['branch_id = $1', ...dateFilterExpenses].join(' AND ');
    const tWhere = ['branch_id = $1', ...dateFilterTreasury].join(' AND ');
    const colorWhere = ['branch_id = $1', ...dateFilterColoring].join(' AND ');
    const custWhere = ['branch_id = $1', ...dateFilterCustody].join(' AND ');

    // 1. Sales summary in period
    const salesRes = await pool.query(`
      SELECT 
        COUNT(id) AS total_invoices,
        COALESCE(SUM(total), 0) AS total_sales,
        COALESCE(SUM(paid_amount), 0) AS total_sales_paid,
        COALESCE(SUM(remaining_balance), 0) AS total_sales_remaining,
        COALESCE(SUM(quantity), 0) AS total_weight_sold
      FROM sales
      WHERE ${sWhere}
    `, params);

    // 2. Purchases summary in period
    const purchRes = await pool.query(`
      SELECT 
        COUNT(id) AS total_purchases_count,
        COALESCE(SUM(total), 0) AS total_purchases,
        COALESCE(SUM(COALESCE(quantity_after_discount, quantity - COALESCE(discount, 0))), 0) AS total_net_qty_purchased,
        COALESCE(SUM(treasury_balance + COALESCE(credit_used, 0)), 0) AS total_purchases_paid,
        COALESCE(SUM(GREATEST(0, total - treasury_balance - COALESCE(credit_used, 0))), 0) AS total_purchases_remaining,
        COALESCE(SUM(treasury_balance), 0) AS total_purchases_treasury
      FROM purchases
      WHERE ${pWhere}
    `, params);

    // 3. Expenses summary in period
    const expRes = await pool.query(`
      SELECT 
        COUNT(id) AS total_expenses_count,
        COALESCE(SUM(amount), 0) AS total_expenses
      FROM expenses
      WHERE ${eWhere}
    `, params);

    // 4. Treasury deposits in period
    const treasRes = await pool.query(`
      SELECT 
        COUNT(id) AS total_deposits_count,
        COALESCE(SUM(amount), 0) AS total_deposits
      FROM treasury
      WHERE ${tWhere}
    `, params);

    // 5. Current Overall Customer Status (debtors vs creditors)
    const custBalRes = await pool.query(`
      SELECT 
        COUNT(CASE WHEN customer_total > 0 THEN 1 END) AS debtors_count,
        COALESCE(SUM(customer_total), 0) AS total_outstanding_debt,
        COUNT(CASE WHEN total_payments > 0 THEN 1 END) AS creditors_count,
        COALESCE(SUM(total_payments), 0) AS total_customer_credit
      FROM customers
      WHERE branch_id = $1 AND is_active = true
    `, [branch_id]);

    // 6. Current Inventory Valuation & Available Stock
    const invRes = await pool.query(`
      SELECT 
        COUNT(id) as total_items,
        COALESCE(SUM(CASE WHEN section_id IS NULL THEN GREATEST(0, available_quantity) ELSE 0 END), 0) +
        COALESCE((SELECT SUM(GREATEST(0, total_weight - issued_weight)) FROM inventory_sections WHERE branch_id = $1 AND is_active = true), 0) as total_available_weight,
        COALESCE(SUM(count - COALESCE(issued_rolls, 0)), 0) as total_available_rolls,
        COALESCE(SUM(available_quantity * COALESCE(price_per_kg, 0)), 0) as total_inventory_value
      FROM inventory
      WHERE branch_id = $1
    `, [branch_id]);

    // 7. Overall Treasury Balance Right Now
    const treasuryBalance = await getCurrentTreasuryBalance(branch_id);

    // 8. Coloring summary in period
    const colorRes = await pool.query(`
      SELECT 
        COUNT(id) AS total_coloring_orders,
        COALESCE(SUM(issued_weight), 0) AS total_coloring_issued_weight,
        COALESCE(SUM(returned_weight), 0) AS total_coloring_returned_weight,
        COALESCE(SUM(weight_gain), 0) AS total_coloring_weight_gain,
        COALESCE(SUM(coloring_cost), 0) AS total_coloring_cost
      FROM coloring_orders
      WHERE ${colorWhere}
    `, params);

    // 9. Custody summary in period
    const custRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'disbursement' THEN amount ELSE 0 END), 0) AS total_custody_disbursed,
        COALESCE(SUM(CASE WHEN type = 'collection' THEN amount ELSE 0 END), 0) AS total_custody_collected,
        COALESCE(SUM(CASE WHEN type = 'disbursement' THEN amount ELSE -amount END), 0) AS net_custody_period
      FROM custodies
      WHERE ${custWhere}
    `, params);

    // Summary calculations
    const salesTotal = Number(salesRes.rows[0].total_sales);
    const purchasesTotal = Number(purchRes.rows[0].total_purchases);
    const expensesTotal = Number(expRes.rows[0].total_expenses);
    const treasuryDeposits = Number(treasRes.rows[0].total_deposits);
    const purchasesPaidTreasury = Number(purchRes.rows[0].total_purchases_treasury);

    // Estimated Operating Profit = Total Sales - Purchases - Expenses
    const estimatedGrossProfit = salesTotal - purchasesTotal;
    const estimatedNetProfit = estimatedGrossProfit - expensesTotal;

    // Net Period Cash Movement
    const periodInflow = treasuryDeposits;
    const periodOutflow = expensesTotal + purchasesPaidTreasury;
    const netPeriodCashFlow = periodInflow - periodOutflow;

    return sendSuccess(res, {
      period: { startDate: startDate || null, endDate: endDate || null },
      sales: salesRes.rows[0],
      purchases: purchRes.rows[0],
      expenses: expRes.rows[0],
      treasuryDeposits,
      netPeriodCashFlow,
      profitability: {
        totalSales: salesTotal,
        totalPurchases: purchasesTotal,
        totalExpenses: expensesTotal,
        estimatedGrossProfit,
        estimatedNetProfit
      },
      customers: custBalRes.rows[0],
      inventory: invRes.rows[0],
      coloring: colorRes.rows[0],
      custody: custRes.rows[0],
      treasuryBalance
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 2. Detailed Sales Report
 * GET /api/reports/sales?startDate=...&endDate=...&customerId=...
 */
const getSalesReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate, customerId, limit = 500 } = req.query;

    const whereClauses = ['s.branch_id = $1'];
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      whereClauses.push(`s.date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }
    if (endDate) {
      whereClauses.push(`s.date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }
    if (customerId) {
      whereClauses.push(`s.customer_id = $${pIdx}`);
      params.push(customerId);
      pIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    // Summary
    const sumRes = await pool.query(`
      SELECT 
        COUNT(s.id) AS invoices_count,
        COALESCE(SUM(s.total), 0) AS total_amount,
        COALESCE(SUM(s.paid_amount), 0) AS total_paid,
        COALESCE(SUM(s.remaining_balance), 0) AS total_remaining,
        COALESCE(SUM(s.quantity), 0) AS total_weight,
        COALESCE(SUM(s.customer_credit), 0) AS total_credit_used
      FROM sales s
      WHERE ${whereStr}
    `, params);

    // Invoices list with customer and items detail
    const listRes = await pool.query(`
      SELECT 
        s.id,
        s.invoice_number,
        s.date,
        s.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        s.quantity,
        s.unit_price,
        s.total,
        s.paid_amount,
        s.remaining_balance,
        s.customer_credit,
        s.notes,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', si.id,
                'inventory_id', si.inventory_id,
                'product', i.product,
                'company', i.company,
                'weight', si.weight,
                'rolls_count', si.rolls_count,
                'price', si.price,
                'total', si.total
              )
            )
            FROM sale_items si
            LEFT JOIN inventory i ON i.id = si.inventory_id
            WHERE si.sale_id = s.id
          ),
          CASE WHEN s.inventory_id IS NOT NULL THEN
            json_build_array(
              json_build_object(
                'id', 0,
                'inventory_id', s.inventory_id,
                'product', inv_old.product,
                'company', inv_old.company,
                'weight', s.quantity,
                'rolls_count', 0,
                'price', s.unit_price,
                'total', s.total
              )
            )
          ELSE '[]'::json END
        ) AS items
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN inventory inv_old ON inv_old.id = s.inventory_id
      WHERE ${whereStr}
      ORDER BY s.date DESC, s.invoice_number DESC
      LIMIT ${Number(limit)}
    `, params);

    // Top selling products in this filter
    const topProductsRes = await pool.query(`
      SELECT 
        i.product,
        i.company,
        COALESCE(SUM(si.weight), 0) AS total_weight_sold,
        COALESCE(SUM(si.rolls_count), 0) AS total_rolls_sold,
        COALESCE(SUM(si.total), 0) AS total_revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN inventory i ON i.id = si.inventory_id
      WHERE ${whereStr}
      GROUP BY i.product, i.company
      ORDER BY total_weight_sold DESC
      LIMIT 10
    `, params);

    return sendSuccess(res, {
      summary: sumRes.rows[0],
      invoices: listRes.rows,
      topProducts: topProductsRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 3. Detailed Purchases Report
 * GET /api/reports/purchases?startDate=...&endDate=...&supplierId=...
 */
const getPurchasesReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate, supplierId, product, limit = 500 } = req.query;

    const whereClauses = ['p.branch_id = $1'];
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      whereClauses.push(`p.date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }
    if (endDate) {
      whereClauses.push(`p.date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }
    if (supplierId) {
      whereClauses.push(`p.customer_id = $${pIdx}`);
      params.push(supplierId);
      pIdx++;
    }
    if (product) {
      whereClauses.push(`p.product ILIKE $${pIdx}`);
      params.push(`%${product}%`);
      pIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    // Summary
    const sumRes = await pool.query(`
      SELECT 
        COUNT(p.id) AS purchases_count,
        COALESCE(SUM(p.total), 0) AS total_amount,
        COALESCE(SUM(p.quantity), 0) AS total_gross_qty,
        COALESCE(SUM(p.discount), 0) AS total_discount_qty,
        COALESCE(SUM(COALESCE(p.quantity_after_discount, p.quantity - COALESCE(p.discount, 0))), 0) AS total_net_qty,
        COALESCE(SUM(p.treasury_balance + COALESCE(p.credit_used, 0)), 0) AS total_paid,
        COALESCE(SUM(GREATEST(0, p.total - p.treasury_balance - COALESCE(p.credit_used, 0))), 0) AS total_remaining,
        COALESCE(SUM(p.treasury_balance), 0) AS total_treasury_out
      FROM purchases p
      WHERE ${whereStr}
    `, params);

    // Records
    const listRes = await pool.query(`
      SELECT 
        p.id,
        p.date,
        p.customer_id,
        c.name AS supplier_name,
        c.phone AS supplier_phone,
        p.product,
        p.quantity,
        p.discount,
        COALESCE(p.quantity_after_discount, p.quantity - COALESCE(p.discount, 0)) AS net_quantity,
        CASE WHEN COALESCE(p.quantity_after_discount, 0) > 0 THEN (p.total / p.quantity_after_discount) ELSE 0 END AS price_per_ton,
        p.total,
        (p.treasury_balance + COALESCE(p.credit_used, 0)) AS paid_amount,
        GREATEST(0, p.total - p.treasury_balance - COALESCE(p.credit_used, 0)) AS remaining_balance,
        p.treasury_balance,
        p.channel,
        p.notes
      FROM purchases p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE ${whereStr}
      ORDER BY p.date DESC, p.id DESC
      LIMIT ${Number(limit)}
    `, params);

    return sendSuccess(res, {
      summary: sumRes.rows[0],
      purchases: listRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 4. Detailed Inventory & Stock Valuation Report
 * GET /api/reports/inventory?company=...
 */
const getInventoryReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { company, product } = req.query;

    const whereClauses = ['i.branch_id = $1'];
    const params = [branch_id];
    let pIdx = 2;

    if (company) {
      whereClauses.push(`i.company ILIKE $${pIdx}`);
      params.push(`%${company}%`);
      pIdx++;
    }
    if (product) {
      whereClauses.push(`i.product ILIKE $${pIdx}`);
      params.push(`%${product}%`);
      pIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    // Summary
    const sumRes = await pool.query(`
      SELECT 
        COUNT(i.id) AS total_items,
        COALESCE(SUM(i.weight_quantity), 0) AS total_initial_weight,
        COALESCE(SUM(i.issued_quantity), 0) AS total_issued_weight,
        COALESCE(SUM(i.available_quantity), 0) AS total_available_weight,
        COALESCE(SUM(i.count), 0) AS total_initial_rolls,
        COALESCE(SUM(i.issued_rolls), 0) AS total_issued_rolls,
        COALESCE(SUM(i.count - COALESCE(i.issued_rolls, 0)), 0) AS total_available_rolls,
        COALESCE(SUM(i.available_quantity * COALESCE(i.price_per_kg, 0)), 0) AS estimated_stock_value
      FROM inventory i
      WHERE ${whereStr}
    `, params);

    // List
    const listRes = await pool.query(`
      SELECT 
        i.id,
        i.date,
        i.company,
        i.product,
        i.weight_quantity,
        i.count,
        COALESCE(i.issued_quantity, 0) AS issued_quantity,
        COALESCE(i.issued_rolls, 0) AS issued_rolls,
        i.available_quantity,
        (i.count - COALESCE(i.issued_rolls, 0)) AS available_rolls,
        COALESCE(i.price_per_kg, 0) AS unit_price,
        (i.available_quantity * COALESCE(i.price_per_kg, 0)) AS item_stock_value,
        i.notes,
        i.image_url
      FROM inventory i
      WHERE ${whereStr}
      ORDER BY i.available_quantity DESC, i.id DESC
    `, params);

    return sendSuccess(res, {
      summary: sumRes.rows[0],
      inventory: listRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 5. Detailed Treasury & Cashflow Report
 * GET /api/reports/treasury?startDate=...&endDate=...&channel=...
 */
const getTreasuryReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate, channel } = req.query;

    const whereClauses = ['t.branch_id = $1'];
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      whereClauses.push(`t.date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }
    if (endDate) {
      whereClauses.push(`t.date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }
    if (channel) {
      whereClauses.push(`COALESCE(t.channel, pt.channel, 'cash') = $${pIdx}`);
      params.push(channel);
      pIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    // Total in period
    const sumRes = await pool.query(`
      SELECT 
        COUNT(t.id) AS deposits_count,
        COALESCE(SUM(t.amount), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'cash' THEN t.amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'wallet' THEN t.amount ELSE 0 END), 0) AS wallet_in,
        COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'instapay' THEN t.amount ELSE 0 END), 0) AS instapay_in,
        COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'bank' THEN t.amount ELSE 0 END), 0) AS bank_in
      FROM treasury t
      LEFT JOIN payment_types pt ON pt.id = t.payment_type_id
      WHERE ${whereStr}
    `, params);

    // List of deposits
    const listRes = await pool.query(`
      SELECT 
        t.id,
        t.date,
        t.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        t.payment_type_id,
        pt.name AS payment_type_name,
        COALESCE(t.channel, pt.channel, 'cash') AS channel,
        t.amount,
        t.notes
      FROM treasury t
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN payment_types pt ON pt.id = t.payment_type_id
      WHERE ${whereStr}
      ORDER BY t.date DESC, t.id DESC
      LIMIT 500
    `, params);

    const overallBalance = await getCurrentTreasuryBalance(branch_id);

    return sendSuccess(res, {
      summary: sumRes.rows[0],
      transactions: listRes.rows,
      overallBalance
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 6. Detailed Expenses Report
 * GET /api/reports/expenses?startDate=...&endDate=...&description=...&channel=...
 */
const getExpensesReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate, description, channel } = req.query;

    const whereClauses = ['e.branch_id = $1'];
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      whereClauses.push(`e.date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }
    if (endDate) {
      whereClauses.push(`e.date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }
    if (description) {
      whereClauses.push(`e.description ILIKE $${pIdx}`);
      params.push(`%${description}%`);
      pIdx++;
    }
    if (channel) {
      whereClauses.push(`COALESCE(e.channel, 'cash') = $${pIdx}`);
      params.push(channel);
      pIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    // Summary
    const sumRes = await pool.query(`
      SELECT 
        COUNT(e.id) AS total_count,
        COALESCE(SUM(e.amount), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN COALESCE(e.channel, 'cash') = 'cash' THEN e.amount ELSE 0 END), 0) AS cash_out,
        COALESCE(SUM(CASE WHEN COALESCE(e.channel, 'cash') = 'wallet' THEN e.amount ELSE 0 END), 0) AS wallet_out,
        COALESCE(SUM(CASE WHEN COALESCE(e.channel, 'cash') = 'instapay' THEN e.amount ELSE 0 END), 0) AS instapay_out,
        COALESCE(SUM(CASE WHEN COALESCE(e.channel, 'cash') = 'bank' THEN e.amount ELSE 0 END), 0) AS bank_out
      FROM expenses e
      WHERE ${whereStr}
    `, params);

    // Breakdown by category/description
    const categoryRes = await pool.query(`
      SELECT 
        e.description,
        COUNT(e.id) AS item_count,
        COALESCE(SUM(e.amount), 0) AS category_total
      FROM expenses e
      WHERE ${whereStr}
      GROUP BY e.description
      ORDER BY category_total DESC
    `, params);

    // List of expenses
    const listRes = await pool.query(`
      SELECT 
        e.id,
        e.date,
        e.description,
        e.amount,
        e.recipient_name,
        COALESCE(e.channel, 'cash') AS channel,
        e.notes
      FROM expenses e
      WHERE ${whereStr}
      ORDER BY e.date DESC, e.id DESC
      LIMIT 500
    `, params);

    return sendSuccess(res, {
      summary: sumRes.rows[0],
      categories: categoryRes.rows,
      expenses: listRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 7. Customers & Debts Report (كشف حساب عميل أو تقرير مديونيات شامل)
 * GET /api/reports/customers?status=...&customerId=...
 */
const getCustomersReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { status, customerId } = req.query; // status: 'all', 'debtor', 'creditor', 'zero'

    // If specific customer is requested: generate full statement of account (كشف حساب تفصيلي)
    if (customerId) {
      const custRes = await pool.query(`
        SELECT id, name, phone, customer_total, total_payments,
               total_payments as current_credit,
               (customer_total - total_payments) as remaining_balance
        FROM customers
        WHERE id = $1 AND branch_id = $2
      `, [customerId, branch_id]);

      if (custRes.rows.length === 0) {
        return sendError(res, 'العميل غير موجود', 404);
      }

      // Ledger statement from customer_balances
      const ledgerRes = await pool.query(`
        SELECT 
          cb.id,
          cb.date,
          cb.source_type,
          cb.source_id,
          cb.invoice_amount,
          cb.paid_amount,
          cb.remaining_balance,
          cb.customer_credit,
          cb.notes,
          s.invoice_number
        FROM customer_balances cb
        LEFT JOIN sales s ON s.id = cb.source_id AND cb.source_type = 'sales'
        WHERE cb.customer_id = $1 AND cb.branch_id = $2
        ORDER BY cb.date ASC, cb.id ASC
      `, [customerId, branch_id]);

      // Outstanding invoices
      const outInvoices = await pool.query(`
        SELECT 
          s.id,
          s.invoice_number,
          s.date,
          s.total,
          s.paid_amount,
          s.remaining_balance
        FROM sales s
        WHERE s.customer_id = $1 AND s.branch_id = $2 AND s.remaining_balance > 0
        ORDER BY s.date ASC
      `, [customerId, branch_id]);

      return sendSuccess(res, {
        customer: custRes.rows[0],
        ledger: ledgerRes.rows,
        outstandingInvoices: outInvoices.rows
      });
    }

    // Otherwise: return all customers status list
    let statusFilter = '';
    if (status === 'debtor') {
      statusFilter = 'AND (customer_total - total_payments) > 0';
    } else if (status === 'creditor') {
      statusFilter = 'AND (customer_total - total_payments) < 0';
    } else if (status === 'zero') {
      statusFilter = 'AND (customer_total - total_payments) = 0';
    }

    const sumRes = await pool.query(`
      SELECT 
        COUNT(id) AS total_customers,
        COUNT(CASE WHEN (customer_total - total_payments) > 0 THEN 1 END) AS debtor_count,
        COALESCE(SUM(CASE WHEN (customer_total - total_payments) > 0 THEN (customer_total - total_payments) ELSE 0 END), 0) AS total_debt_due,
        COUNT(CASE WHEN (customer_total - total_payments) < 0 THEN 1 END) AS creditor_count,
        COALESCE(SUM(CASE WHEN (customer_total - total_payments) < 0 THEN ABS(customer_total - total_payments) ELSE 0 END), 0) AS total_credit_owed
      FROM customers
      WHERE branch_id = $1 AND is_active = true
    `, [branch_id]);

    const listRes = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.phone,
        c.customer_total,
        c.total_payments,
        c.total_payments as current_credit,
        (c.customer_total - c.total_payments) as net_balance,
        (
          SELECT COUNT(s.id)
          FROM sales s
          WHERE s.customer_id = c.id AND s.branch_id = c.branch_id AND s.remaining_balance > 0
        ) as unpaid_invoices_count
      FROM customers c
      WHERE c.branch_id = $1 AND c.is_active = true ${statusFilter}
      ORDER BY (c.customer_total - c.total_payments) DESC, c.name ASC
    `, [branch_id]);

    return sendSuccess(res, {
      summary: sumRes.rows[0],
      customers: listRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 8. Coloring & Powder Coating Report
 * GET /api/reports/coloring?startDate=...&endDate=...&status=...&company=...
 */
const getColoringReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate, status, company, limit = 500 } = req.query;

    const whereClauses = ['co.branch_id = $1'];
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      whereClauses.push(`co.date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }
    if (endDate) {
      whereClauses.push(`co.date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }
    if (status) {
      whereClauses.push(`co.status = $${pIdx}`);
      params.push(status);
      pIdx++;
    }
    if (company) {
      whereClauses.push(`(co.coloring_company ILIKE $${pIdx} OR co.product ILIKE $${pIdx} OR co.colored_product ILIKE $${pIdx} OR co.order_number ILIKE $${pIdx} OR co.color ILIKE $${pIdx})`);
      params.push(`%${company}%`);
      pIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    // Summary
    const sumRes = await pool.query(`
      SELECT 
        COUNT(co.id) AS total_orders,
        COUNT(CASE WHEN co.status = 'pending' THEN 1 END) AS pending_orders,
        COUNT(CASE WHEN co.status = 'returned' THEN 1 END) AS returned_orders,
        COUNT(CASE WHEN co.status = 'stocked' THEN 1 END) AS stocked_orders,
        COALESCE(SUM(co.issued_weight), 0) AS total_issued_weight,
        COALESCE(SUM(co.returned_weight), 0) AS total_returned_weight,
        COALESCE(SUM(co.weight_gain), 0) AS total_weight_gain,
        COALESCE(SUM(co.coloring_cost), 0) AS total_coloring_cost
      FROM coloring_orders co
      WHERE ${whereStr}
    `, params);

    // List of coloring orders
    const listRes = await pool.query(`
      SELECT 
        co.*,
        pt.name AS payment_type_name
      FROM coloring_orders co
      LEFT JOIN payment_types pt ON pt.id = co.payment_type_id
      WHERE ${whereStr}
      ORDER BY co.date DESC, co.id DESC
      LIMIT $${pIdx}
    `, [...params, parseInt(limit, 10)]);

    // Monthly breakdown for charts
    const monthlyRes = await pool.query(`
      SELECT 
        TO_CHAR(co.date, 'YYYY-MM') AS month,
        COUNT(co.id) AS orders_count,
        COALESCE(SUM(co.issued_weight), 0) AS issued_weight,
        COALESCE(SUM(co.returned_weight), 0) AS returned_weight,
        COALESCE(SUM(co.weight_gain), 0) AS weight_gain,
        COALESCE(SUM(co.coloring_cost), 0) AS cost
      FROM coloring_orders co
      WHERE ${whereStr}
      GROUP BY TO_CHAR(co.date, 'YYYY-MM')
      ORDER BY month ASC
    `, params);

    // Breakdown by coloring company
    const companyRes = await pool.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(co.coloring_company), ''), 'غير محدد') AS company_name,
        COUNT(co.id) AS orders_count,
        COALESCE(SUM(co.issued_weight), 0) AS total_weight,
        COALESCE(SUM(co.coloring_cost), 0) AS total_cost
      FROM coloring_orders co
      WHERE ${whereStr}
      GROUP BY COALESCE(NULLIF(TRIM(co.coloring_company), ''), 'غير محدد')
      ORDER BY total_weight DESC
    `, params);

    return sendSuccess(res, {
      summary: sumRes.rows[0],
      orders: listRes.rows,
      monthlyBreakdown: monthlyRes.rows,
      companyBreakdown: companyRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 9. Custody Report
 * GET /api/reports/custody?startDate=...&endDate=...&personName=...&type=...&channel=...
 */
const getCustodyReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate, personName, type, channel, limit = 500 } = req.query;

    const whereClauses = ['c.branch_id = $1'];
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      whereClauses.push(`c.date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }
    if (endDate) {
      whereClauses.push(`c.date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }
    if (personName) {
      whereClauses.push(`(c.person_name ILIKE $${pIdx} OR c.voucher_number ILIKE $${pIdx} OR c.notes ILIKE $${pIdx})`);
      params.push(`%${personName}%`);
      pIdx++;
    }
    if (type) {
      whereClauses.push(`c.type = $${pIdx}`);
      params.push(type);
      pIdx++;
    }
    if (channel) {
      whereClauses.push(`COALESCE(c.channel, pt.channel, 'cash') = $${pIdx}`);
      params.push(channel);
      pIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    // Summary
    const sumRes = await pool.query(`
      SELECT 
        COUNT(c.id) AS total_transactions,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE 0 END), 0) AS total_disbursed,
        COALESCE(SUM(CASE WHEN c.type = 'collection' THEN c.amount ELSE 0 END), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE -c.amount END), 0) AS net_period_change,
        COUNT(DISTINCT LOWER(TRIM(c.person_name))) AS persons_count
      FROM custodies c
      LEFT JOIN payment_types pt ON pt.id = c.payment_type_id
      WHERE ${whereStr}
    `, params);

    // Current overall outstanding custody balance
    const overallBalRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'disbursement' THEN amount ELSE -amount END), 0) AS total_outstanding_custody
      FROM custodies
      WHERE branch_id = $1
    `, [branch_id]);

    // Transactions list
    const listRes = await pool.query(`
      SELECT 
        c.*,
        pt.name AS payment_type_name,
        COALESCE(c.channel, pt.channel, 'cash') AS effective_channel
      FROM custodies c
      LEFT JOIN payment_types pt ON pt.id = c.payment_type_id
      WHERE ${whereStr}
      ORDER BY c.date DESC, c.id DESC
      LIMIT $${pIdx}
    `, [...params, parseInt(limit, 10)]);

    // Persons balances summary (Top debtors)
    const personsRes = await pool.query(`
      SELECT 
        c.person_name,
        MAX(c.phone) AS phone,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE 0 END), 0) AS total_disbursed,
        COALESCE(SUM(CASE WHEN c.type = 'collection' THEN c.amount ELSE 0 END), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE -c.amount END), 0) AS balance,
        COUNT(c.id) AS transactions_count
      FROM custodies c
      WHERE c.branch_id = $1
      GROUP BY c.person_name
      ORDER BY balance DESC
    `, [branch_id]);

    // Monthly breakdown for charts
    const monthlyRes = await pool.query(`
      SELECT 
        TO_CHAR(c.date, 'YYYY-MM') AS month,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE 0 END), 0) AS disbursed,
        COALESCE(SUM(CASE WHEN c.type = 'collection' THEN c.amount ELSE 0 END), 0) AS collected
      FROM custodies c
      WHERE ${whereStr}
      GROUP BY TO_CHAR(c.date, 'YYYY-MM')
      ORDER BY month ASC
    `, params);

    return sendSuccess(res, {
      summary: {
        ...sumRes.rows[0],
        total_outstanding_custody: overallBalRes.rows[0]?.total_outstanding_custody || 0
      },
      transactions: listRes.rows,
      persons: personsRes.rows,
      monthlyBreakdown: monthlyRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 10. Custody Transfers Report (تقرير تحويلات العهد بين الأفراد)
 * GET /api/reports/custody-transfers?startDate=...&endDate=...&search=...
 */
const getCustodyTransfersReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate, search, limit = 500 } = req.query;

    const whereClauses = ['ct.branch_id = $1'];
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      whereClauses.push(`ct.date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }
    if (endDate) {
      whereClauses.push(`ct.date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }
    if (search) {
      whereClauses.push(`(ct.from_person ILIKE $${pIdx} OR ct.to_person ILIKE $${pIdx} OR ct.receipt_number ILIKE $${pIdx} OR ct.notes ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const whereStr = whereClauses.join(' AND ');

    // 1. Summary statistics
    const sumRes = await pool.query(`
      SELECT 
        COUNT(ct.id) AS transfers_count,
        COALESCE(SUM(ct.amount), 0) AS total_amount,
        COALESCE(AVG(ct.amount), 0) AS avg_transfer
      FROM custody_transfers ct
      WHERE ${whereStr}
    `, params);

    // 2. Top sender (person who transferred the most)
    const topSenderRes = await pool.query(`
      SELECT from_person, COALESCE(SUM(amount), 0) AS total, COUNT(id) AS count
      FROM custody_transfers ct
      WHERE ${whereStr}
      GROUP BY from_person
      ORDER BY total DESC
      LIMIT 1
    `, params);

    // 3. Top receiver (person who received the most)
    const topReceiverRes = await pool.query(`
      SELECT to_person, COALESCE(SUM(amount), 0) AS total, COUNT(id) AS count
      FROM custody_transfers ct
      WHERE ${whereStr}
      GROUP BY to_person
      ORDER BY total DESC
      LIMIT 1
    `, params);

    // 4. Detailed transfers list
    const listRes = await pool.query(`
      SELECT 
        ct.id,
        ct.date,
        ct.receipt_number,
        ct.from_person,
        ct.to_person,
        ct.amount,
        ct.notes,
        ct.created_at
      FROM custody_transfers ct
      WHERE ${whereStr}
      ORDER BY ct.date DESC, ct.id DESC
      LIMIT $${pIdx}
    `, [...params, parseInt(limit, 10)]);

    // 5. Monthly breakdown for chart
    const monthlyRes = await pool.query(`
      SELECT 
        TO_CHAR(ct.date, 'YYYY-MM') AS month,
        COUNT(ct.id) AS count,
        COALESCE(SUM(ct.amount), 0) AS total_amount
      FROM custody_transfers ct
      WHERE ${whereStr}
      GROUP BY TO_CHAR(ct.date, 'YYYY-MM')
      ORDER BY month ASC
    `, params);

    // 6. Top senders list (up to 6)
    const sendersRes = await pool.query(`
      SELECT from_person AS name, COALESCE(SUM(amount), 0) AS total, COUNT(id) AS count
      FROM custody_transfers ct
      WHERE ${whereStr}
      GROUP BY from_person
      ORDER BY total DESC
      LIMIT 6
    `, params);

    // 7. Top receivers list (up to 6)
    const receiversRes = await pool.query(`
      SELECT to_person AS name, COALESCE(SUM(amount), 0) AS total, COUNT(id) AS count
      FROM custody_transfers ct
      WHERE ${whereStr}
      GROUP BY to_person
      ORDER BY total DESC
      LIMIT 6
    `, params);

    return sendSuccess(res, {
      summary: {
        transfers_count: parseInt(sumRes.rows[0]?.transfers_count || 0, 10),
        total_amount: parseFloat(sumRes.rows[0]?.total_amount || 0),
        avg_transfer: parseFloat(sumRes.rows[0]?.avg_transfer || 0),
        top_sender: topSenderRes.rows[0] ? {
          from_person: topSenderRes.rows[0].from_person,
          total: parseFloat(topSenderRes.rows[0].total || 0),
          count: parseInt(topSenderRes.rows[0].count || 0, 10)
        } : null,
        top_receiver: topReceiverRes.rows[0] ? {
          to_person: topReceiverRes.rows[0].to_person,
          total: parseFloat(topReceiverRes.rows[0].total || 0),
          count: parseInt(topReceiverRes.rows[0].count || 0, 10)
        } : null,
      },
      transfers: listRes.rows,
      monthlyBreakdown: monthlyRes.rows,
      topSenders: sendersRes.rows,
      topReceivers: receiversRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 11. Branch-to-Branch Transfers Report
 * GET /api/reports/branch-transfers?startDate=...&endDate=...&type=...&status=...&direction=...&search=...
 */
const getBranchTransfersReport = async (req, res, next) => {
  try {
    const branch_id = resolveUserBranch(req);
    const { startDate, endDate, type, status, direction = 'all', search, limit = 500 } = req.query;

    const whereClauses = [];
    const params = [];
    let pIdx = 1;

    // Filter by branch
    if (branch_id) {
      if (direction === 'outgoing') {
        whereClauses.push(`t.from_branch_id = $${pIdx}`);
        params.push(branch_id);
        pIdx++;
      } else if (direction === 'incoming') {
        whereClauses.push(`t.to_branch_id = $${pIdx}`);
        params.push(branch_id);
        pIdx++;
      } else {
        whereClauses.push(`(t.from_branch_id = $${pIdx} OR t.to_branch_id = $${pIdx})`);
        params.push(branch_id);
        pIdx++;
      }
    }

    if (startDate) {
      whereClauses.push(`t.created_at::date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }

    if (endDate) {
      whereClauses.push(`t.created_at::date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }

    if (type && type !== 'all') {
      whereClauses.push(`t.type = $${pIdx}`);
      params.push(type);
      pIdx++;
    }

    if (status && status !== 'all') {
      whereClauses.push(`t.status = $${pIdx}`);
      params.push(status);
      pIdx++;
    }

    if (search && search.trim()) {
      whereClauses.push(`(
        t.transfer_number ILIKE $${pIdx} OR
        fb.name ILIKE $${pIdx} OR
        tb.name ILIKE $${pIdx} OR
        t.notes ILIKE $${pIdx}
      )`);
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 1. Summary KPIs
    const branchConditionOutgoing = branch_id ? `t.from_branch_id = ${branch_id} AND` : '';
    const branchConditionIncoming = branch_id ? `t.to_branch_id = ${branch_id} AND` : '';

    const sumRes = await pool.query(`
      SELECT 
        COUNT(t.id) AS transfers_count,
        COUNT(CASE WHEN t.type = 'monetary' THEN 1 END) AS monetary_transfers_count,
        COUNT(CASE WHEN t.type = 'inventory' THEN 1 END) AS inventory_transfers_count,
        COALESCE(SUM(CASE WHEN t.type = 'monetary' AND ${branchConditionOutgoing} t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS total_monetary_outgoing,
        COALESCE(SUM(CASE WHEN t.type = 'monetary' AND ${branchConditionIncoming} t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS total_monetary_incoming,
        COUNT(CASE WHEN t.status = 'pending' THEN 1 END) AS total_pending,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) AS total_completed,
        COUNT(CASE WHEN t.status = 'rejected' THEN 1 END) AS total_rejected,
        COUNT(CASE WHEN t.status = 'cancelled' THEN 1 END) AS total_cancelled
      FROM transfers t
      JOIN branches fb ON fb.id = t.from_branch_id
      JOIN branches tb ON tb.id = t.to_branch_id
      ${whereStr}
    `, params);

    // 2. Transfers list
    const listRes = await pool.query(`
      SELECT 
        t.id,
        t.transfer_number,
        t.from_branch_id,
        fb.name AS from_branch_name,
        t.to_branch_id,
        tb.name AS to_branch_name,
        t.type,
        t.status,
        t.amount,
        t.channel,
        t.notes,
        t.rejection_reason,
        t.created_at,
        t.completed_at,
        u_cr.full_name AS created_by_name,
        u_rc.full_name AS received_by_name,
        (
          SELECT json_agg(
            json_build_object(
              'id', ti.id,
              'product', ti.product,
              'company', ti.company,
              'weight', ti.weight,
              'rolls_count', ti.rolls_count,
              'notes', ti.notes
            )
          )
          FROM transfer_items ti
          WHERE ti.transfer_id = t.id
        ) AS items
      FROM transfers t
      JOIN branches fb ON fb.id = t.from_branch_id
      JOIN branches tb ON tb.id = t.to_branch_id
      LEFT JOIN users u_cr ON u_cr.id = t.created_by_user_id
      LEFT JOIN users u_rc ON u_rc.id = t.received_by_user_id
      ${whereStr}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${pIdx}
    `, [...params, parseInt(limit, 10)]);

    // 3. Monthly Breakdown for charts
    const monthlyRes = await pool.query(`
      SELECT 
        TO_CHAR(t.created_at, 'YYYY-MM') AS month,
        COUNT(t.id) AS count,
        COALESCE(SUM(CASE WHEN t.type = 'monetary' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS total_monetary,
        COUNT(CASE WHEN t.type = 'monetary' THEN 1 END) AS monetary_count,
        COUNT(CASE WHEN t.type = 'inventory' THEN 1 END) AS inventory_count
      FROM transfers t
      JOIN branches fb ON fb.id = t.from_branch_id
      JOIN branches tb ON tb.id = t.to_branch_id
      ${whereStr}
      GROUP BY TO_CHAR(t.created_at, 'YYYY-MM')
      ORDER BY month ASC
    `, params);

    // 4. By Channel breakdown
    const channelRes = await pool.query(`
      SELECT 
        COALESCE(t.channel, 'cash') AS channel,
        COUNT(t.id) AS count,
        COALESCE(SUM(t.amount), 0) AS total_amount
      FROM transfers t
      JOIN branches fb ON fb.id = t.from_branch_id
      JOIN branches tb ON tb.id = t.to_branch_id
      ${whereStr ? `${whereStr} AND t.type = 'monetary'` : `WHERE t.type = 'monetary'`}
      GROUP BY COALESCE(t.channel, 'cash')
      ORDER BY total_amount DESC
    `, params);

    // 5. Counterparty branch breakdown
    const counterpartyBranchExpr = branch_id 
      ? `CASE WHEN t.from_branch_id = ${branch_id} THEN tb.name ELSE fb.name END`
      : `fb.name || ' ➔ ' || tb.name`;

    const branchBreakdownRes = await pool.query(`
      SELECT 
        ${counterpartyBranchExpr} AS branch_name,
        COUNT(t.id) AS count,
        COALESCE(SUM(CASE WHEN t.type = 'monetary' THEN t.amount ELSE 0 END), 0) AS total_monetary
      FROM transfers t
      JOIN branches fb ON fb.id = t.from_branch_id
      JOIN branches tb ON tb.id = t.to_branch_id
      ${whereStr}
      GROUP BY ${counterpartyBranchExpr}
      ORDER BY count DESC
      LIMIT 6
    `, params);

    return sendSuccess(res, {
      summary: {
        transfers_count: parseInt(sumRes.rows[0]?.transfers_count || 0, 10),
        monetary_transfers_count: parseInt(sumRes.rows[0]?.monetary_transfers_count || 0, 10),
        inventory_transfers_count: parseInt(sumRes.rows[0]?.inventory_transfers_count || 0, 10),
        total_monetary_outgoing: parseFloat(sumRes.rows[0]?.total_monetary_outgoing || 0),
        total_monetary_incoming: parseFloat(sumRes.rows[0]?.total_monetary_incoming || 0),
        total_pending: parseInt(sumRes.rows[0]?.total_pending || 0, 10),
        total_completed: parseInt(sumRes.rows[0]?.total_completed || 0, 10),
        total_rejected: parseInt(sumRes.rows[0]?.total_rejected || 0, 10),
        total_cancelled: parseInt(sumRes.rows[0]?.total_cancelled || 0, 10),
      },
      transfers: listRes.rows,
      monthlyBreakdown: monthlyRes.rows,
      byChannel: channelRes.rows,
      byBranch: branchBreakdownRes.rows
    });
  } catch (err) {
    next(err);
  }
};

// ─── 12. Jard Report (تقرير الجرد المستقل وحركات الوارد والصادر) ─────────────
const getJardReport = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { startDate, endDate, company, section_id } = req.query;

    let where = `WHERE j.branch_id = $1`;
    const params = [branch_id];
    let pIdx = 2;

    if (startDate) {
      where += ` AND j.date >= $${pIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      where += ` AND j.date <= $${pIdx++}`;
      params.push(endDate);
    }
    if (company && company !== 'all') {
      where += ` AND LOWER(TRIM(j.company)) = LOWER(TRIM($${pIdx++}))`;
      params.push(company);
    }
    if (section_id && section_id !== 'all') {
      where += ` AND j.section_id = $${pIdx++}`;
      params.push(Number(section_id));
    }

    const summaryRes = await pool.query(`
      SELECT
        COUNT(*) AS total_items,
        COALESCE(SUM(j.opening_rolls), 0) AS total_opening_rolls,
        COALESCE(SUM(j.opening_weight), 0) AS total_opening_weight,
        COALESCE(SUM(j.incoming_rolls), 0) AS total_incoming_rolls,
        COALESCE(SUM(j.incoming_weight), 0) AS total_incoming_weight,
        COALESCE(SUM(j.outgoing_rolls), 0) AS total_outgoing_rolls,
        COALESCE(SUM(j.outgoing_weight), 0) AS total_outgoing_weight,
        COALESCE(SUM(j.available_rolls), 0) AS total_available_rolls,
        COALESCE(SUM(j.available_weight), 0) AS total_available_weight,
        COUNT(CASE WHEN j.available_rolls > 0 THEN 1 END) AS in_stock_count,
        COUNT(CASE WHEN j.available_rolls <= 0 THEN 1 END) AS out_of_stock_count
      FROM jard j
      ${where}
    `, params);

    const listRes = await pool.query(`
      SELECT
        j.*,
        sec.name AS section_name,
        (SELECT COUNT(*) FROM jard_movements jm WHERE jm.jard_id = j.id) AS movements_count
      FROM jard j
      LEFT JOIN inventory_sections sec ON sec.id = j.section_id
      ${where}
      ORDER BY j.company ASC, j.product ASC
    `, params);

    const s = summaryRes.rows[0];

    return sendSuccess(res, {
      summary: {
        total_items: parseInt(s?.total_items || 0, 10),
        total_opening_rolls: parseInt(s?.total_opening_rolls || 0, 10),
        total_opening_weight: parseFloat(s?.total_opening_weight || 0),
        total_incoming_rolls: parseInt(s?.total_incoming_rolls || 0, 10),
        total_incoming_weight: parseFloat(s?.total_incoming_weight || 0),
        total_outgoing_rolls: parseInt(s?.total_outgoing_rolls || 0, 10),
        total_outgoing_weight: parseFloat(s?.total_outgoing_weight || 0),
        total_available_rolls: parseInt(s?.total_available_rolls || 0, 10),
        total_available_weight: parseFloat(s?.total_available_weight || 0),
        in_stock_count: parseInt(s?.in_stock_count || 0, 10),
        out_of_stock_count: parseInt(s?.out_of_stock_count || 0, 10),
      },
      items: listRes.rows
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getComprehensiveReport,
  getSalesReport,
  getPurchasesReport,
  getInventoryReport,
  getTreasuryReport,
  getExpensesReport,
  getCustomersReport,
  getColoringReport,
  getCustodyReport,
  getCustodyTransfersReport,
  getBranchTransfersReport,
  getJardReport
};
