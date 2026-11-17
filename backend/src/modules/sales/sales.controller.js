const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * GET /api/sales
 */
const getSales = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { customer_id, inventory_id, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = `
      SELECT s.id, s.invoice_number, s.date, s.customer_id, s.total, s.paid_amount,
             s.remaining_balance, s.customer_credit, COALESCE(s.settlement_amount, 0) as settlement_amount, s.notes, s.created_at, s.updated_at,
             s.returns_total, s.gross_total,
             c.name as customer_name, c.phone as customer_phone,
             c.total_payments as customer_current_credit, c.customer_total as customer_current_debt,
             br.name as branch_name, br.phone as branch_phone, br.address as branch_address
      FROM sales s
      JOIN customers c ON c.id = s.customer_id
      LEFT JOIN branches br ON br.id = s.branch_id
      WHERE s.branch_id = $1
    `;
    const params = [branch_id];
    let paramIndex = 2;


    let countQuery = `SELECT COUNT(*) FROM sales s JOIN customers c ON c.id = s.customer_id WHERE s.branch_id = $1`;
    let summaryQuery = `
      SELECT 
        COALESCE(SUM(s.total), 0) as total_sales_amount,
        COALESCE(SUM(s.paid_amount), 0) as total_collected_amount,
        COALESCE(SUM(s.remaining_balance), 0) as total_remaining_amount
      FROM sales s 
      JOIN customers c ON c.id = s.customer_id 
      WHERE s.branch_id = $1
    `;
    const countParams = [branch_id];
    let countIndex = 2;

    if (customer_id) {
      const ids = customer_id.split(',').map(v => v.trim()).filter(Boolean);
      if (ids.length === 1) {
        query += ` AND s.customer_id = $${paramIndex}`;
        countQuery += ` AND s.customer_id = $${countIndex}`;
        summaryQuery += ` AND s.customer_id = $${countIndex}`;
        params.push(ids[0]); countParams.push(ids[0]);
      } else {
        query += ` AND s.customer_id = ANY($${paramIndex}::int[])`;
        countQuery += ` AND s.customer_id = ANY($${countIndex}::int[])`;
        summaryQuery += ` AND s.customer_id = ANY($${countIndex}::int[])`;
        params.push(ids.map(Number)); countParams.push(ids.map(Number));
      }
      paramIndex++; countIndex++;
    }

    if (inventory_id) {
      const ids = inventory_id.split(',').map(v => v.trim()).filter(Boolean);
      if (ids.length === 1) {
        query += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.inventory_id = $${paramIndex})`;
        countQuery += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.inventory_id = $${countIndex})`;
        summaryQuery += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.inventory_id = $${countIndex})`;
        params.push(ids[0]); countParams.push(ids[0]);
      } else {
        query += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.inventory_id = ANY($${paramIndex}::int[]))`;
        countQuery += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.inventory_id = ANY($${countIndex}::int[]))`;
        summaryQuery += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.inventory_id = ANY($${countIndex}::int[]))`;
        params.push(ids.map(Number)); countParams.push(ids.map(Number));
      }
      paramIndex++; countIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND s.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      countQuery += ` AND s.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      summaryQuery += ` AND s.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      params.push(dateFrom, dateTo); countParams.push(dateFrom, dateTo);
      paramIndex += 2; countIndex += 2;
    } else if (dateFrom) {
      query += ` AND s.date >= $${paramIndex}`;
      countQuery += ` AND s.date >= $${countIndex}`;
      summaryQuery += ` AND s.date >= $${countIndex}`;
      params.push(dateFrom); countParams.push(dateFrom);
      paramIndex++; countIndex++;
    } else if (dateTo) {
      query += ` AND s.date <= $${paramIndex}`;
      countQuery += ` AND s.date <= $${countIndex}`;
      summaryQuery += ` AND s.date <= $${countIndex}`;
      params.push(dateTo); countParams.push(dateTo);
      paramIndex++; countIndex++;
    }

    query += ` ORDER BY s.invoice_number DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const [result, countResult, summaryResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
      pool.query(summaryQuery, countParams)
    ]);

    const saleIds = result.rows.map(r => r.id);
    let itemsByInvoice = {};
    if (saleIds.length > 0) {
      const itemsRes = await pool.query(
        `SELECT si.*, i.product as product_name, i.company
         FROM sale_items si
         LEFT JOIN inventory i ON i.id = si.inventory_id
         WHERE si.sale_id = ANY($1::int[])
         ORDER BY si.id ASC`,
        [saleIds]
      );
      itemsRes.rows.forEach(item => {
        if (!itemsByInvoice[item.sale_id]) itemsByInvoice[item.sale_id] = [];
        itemsByInvoice[item.sale_id].push(item);
      });
    }

    const sales = result.rows.map(s => ({
      ...s,
      items: itemsByInvoice[s.id] || [],
      product_name: (itemsByInvoice[s.id] || [])[0]?.product_name || '-'
    }));

    return sendSuccess(res, {
      sales,
      total: parseInt(countResult.rows[0].count),
      summary: summaryResult.rows[0] || { total_sales_amount: 0, total_collected_amount: 0, total_remaining_amount: 0 },
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/:id
 * Returns single sale with full items, customer, previous unpaid invoices, and payment method
 */
const getSaleById = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const saleRes = await pool.query(`
      SELECT s.*, 
             c.name as customer_name, c.phone as customer_phone,
             c.total_payments as customer_current_credit, c.customer_total as customer_current_debt,
             br.name as branch_name, br.phone as branch_phone, br.address as branch_address
      FROM sales s
      JOIN customers c ON c.id = s.customer_id
      LEFT JOIN branches br ON br.id = s.branch_id
      WHERE s.id = $1 AND s.branch_id = $2
    `, [id, branch_id]);

    if (saleRes.rows.length === 0) return sendError(res, 'الفاتورة غير موجودة', 404);
    const sale = saleRes.rows[0];

    // Fetch items
    const itemsRes = await pool.query(`
      SELECT si.*, i.product as product_name, i.company
      FROM sale_items si
      LEFT JOIN inventory i ON i.id = si.inventory_id
      WHERE si.sale_id = $1
      ORDER BY si.id ASC
    `, [id]);
    sale.items = itemsRes.rows;

    // Fetch returns associated with this sale
    const returnsRes = await pool.query(`
      SELECT r.*, i.product as inventory_product, i.company as inventory_company
      FROM returns r
      LEFT JOIN inventory i ON i.id = r.inventory_id
      WHERE r.sale_id = $1
      ORDER BY r.id ASC
    `, [id]);
    sale.returns = returnsRes.rows;

    // Fetch payment method name from treasury (cash payment recorded at time of sale)
    const paymentRes = await pool.query(`
      SELECT t.amount, pt.name as payment_type_name, pt.id as payment_type_id
      FROM treasury t
      LEFT JOIN payment_types pt ON pt.id = t.payment_type_id
      WHERE t.branch_id = $1 
        AND t.notes LIKE $2
      ORDER BY t.id ASC
      LIMIT 1
    `, [branch_id, `%فاتورة مبيعات رقم ${sale.invoice_number}%`]);

    if (paymentRes.rows.length > 0) {
      sale.payment_type_name = paymentRes.rows[0].payment_type_name;
      sale.cash_paid = Number(paymentRes.rows[0].amount || 0);
    } else {
      sale.payment_type_name = null;
      sale.cash_paid = 0;
    }


    // Fetch previous unpaid invoices for this customer
    const prevInvoicesRes = await pool.query(`
      SELECT invoice_number, date, total, paid_amount, remaining_balance
      FROM sales
      WHERE customer_id = $1 AND branch_id = $2 AND id != $3 AND remaining_balance > 0 AND date <= $4
      ORDER BY date DESC, invoice_number DESC
      LIMIT 5
    `, [sale.customer_id, branch_id, id, sale.date]);
    sale.previous_unpaid_invoices = prevInvoicesRes.rows;

    return sendSuccess(res, sale);
  } catch (err) {
    next(err);
  }
};


/**
 * POST /api/sales
 */
const addSale = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    let {
      date, customer_id, customer_name, phone = '', saveNewCustomer,
      paid_amount = 0, settlement_amount = 0, payment_type_id, notes = '',
      items = [], returns = [], add_remaining_to_balance = true,
      use_customer_credit = true, receipt_image = null
    } = req.body;

    if (!date) throw new Error('التاريخ مطلوب');
    if ((!items || items.length === 0) && (!returns || returns.length === 0)) {
      throw new Error('يجب إضافة صنف واحد على الأقل للفاتورة أو صنف مرتجع');
    }
    if (!customer_id && !customer_name) throw new Error('يجب تحديد العميل أو إدخال اسم عميل جديد');

    if (!customer_id && customer_name) {
      const saveCust = saveNewCustomer !== undefined ? saveNewCustomer : req.body.save_new_customer;
      const isActive = saveCust !== false && saveCust !== 'false';
      const newCust = await client.query(
        `INSERT INTO customers (branch_id, name, phone, is_active) VALUES ($1, $2, $3, $4) RETURNING id`,
        [branch_id, customer_name.trim(), phone ? phone.trim() : null, isActive]
      );
      customer_id = newCust.rows[0].id;
    }

    const paid = Number(paid_amount);
    let grossTotal = 0;
    const processedItems = [];

    // Process sold items
    for (const item of items) {
      const { inventory_id } = item;
      const weight = Number(item.weight ?? item.quantity ?? 0);
      const rolls_count = Number(item.rolls_count ?? item.count ?? 0);
      const price = Number(item.price ?? item.unit_price ?? 0);

      if (!inventory_id || weight <= 0 || price <= 0) {
        throw new Error('يرجى تحديد المنتج وإدخال وزن وسعر صحيحين لكل صنف مباع');
      }
      const lineTotal = weight * price;

      const invRes = await client.query(
        `SELECT id, product, count, issued_rolls, weight_quantity, issued_quantity, available_quantity 
         FROM inventory WHERE id = $1 AND branch_id = $2`,
        [inventory_id, branch_id]
      );
      if (invRes.rows.length === 0) throw new Error('المنتج غير موجود في المخزن');

      const invRow = invRes.rows[0];
      const productName = invRow.product;

      // Check TOTAL available weight for this product across all companies in this branch
      const totalAvailRes = await client.query(
        `SELECT COALESCE(SUM(available_quantity), 0) AS total_avail
         FROM inventory
         WHERE branch_id = $1 AND LOWER(TRIM(product)) = LOWER(TRIM($2))`,
        [branch_id, productName]
      );
      const totalAvailableWeight = Number(totalAvailRes.rows[0].total_avail);

      if (weight > totalAvailableWeight) {
        throw new Error(`الوزن المطلوب من "${productName}" (${weight} كج) يتجاوز إجمالي الوزن المتاح بالمخزن (${totalAvailableWeight.toFixed(2)} كج)`);
      }

      processedItems.push({ inventory_id, productName, weight, rolls_count, price, lineTotal });
      grossTotal += lineTotal;
    }

    // Process returns (مرتجع بضاعة مع الفاتورة)
    let returnsTotal = 0;
    const processedReturns = [];

    for (const ret of returns) {
      const weight = Number(ret.weight || 0);
      const rolls_count = Number(ret.rolls_count || ret.count || 0);
      const price_per_ton = Number(ret.price_per_ton || 0);
      if (weight <= 0 || price_per_ton <= 0) {
        throw new Error('يرجى إدخال وزن وسعر طن صحيحين لكل صنف مرتجع');
      }
      const lineReturnTotal = weight * price_per_ton; // حاصل ضرب الوزن في سعر الطن

      let retInvId = ret.inventory_id ? Number(ret.inventory_id) : null;
      let retProduct = ret.product || '';
      let retCompany = ret.company || '';

      if (retInvId) {
        const invRes = await client.query(
          `SELECT product, company FROM inventory WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
          [retInvId, branch_id]
        );
        if (invRes.rows.length === 0) throw new Error('صنف المخزون المحدد للمرتجع غير موجود');
        if (!retProduct) retProduct = invRes.rows[0].product;
        if (!retCompany) retCompany = invRes.rows[0].company || '';
      } else if (retProduct) {
        const existInv = await client.query(
          `SELECT id, product, company FROM inventory WHERE LOWER(TRIM(product)) = LOWER(TRIM($1)) AND branch_id = $2 LIMIT 1 FOR UPDATE`,
          [retProduct.trim(), branch_id]
        );
        if (existInv.rows.length > 0) {
          retInvId = existInv.rows[0].id;
        } else {
          const newInv = await client.query(
            `INSERT INTO inventory (branch_id, date, company, product, weight_quantity, count, roll_price, price_per_kg, total, notes)
             VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 'صنف من مرتجع فاتورة') RETURNING id`,
            [branch_id, date, (retCompany || '').trim(), retProduct.trim()]
          );
          retInvId = newInv.rows[0].id;
        }
      } else {
        throw new Error('يرجى تحديد المخزون المرتجع إليه أو إدخال اسم الصنف المرتجع');
      }

      processedReturns.push({
        inventory_id: retInvId,
        product: retProduct,
        company: retCompany,
        weight,
        rolls_count,
        price_per_ton,
        total: lineReturnTotal,
        notes: ret.notes || ''
      });
      returnsTotal += lineReturnTotal;
    }

    // Deduct returns from invoice: net invoice total
    const netInvoiceTotal = Math.max(0, grossTotal - returnsTotal);
    const excessReturn = Math.max(0, returnsTotal - grossTotal);

    const custRes = await client.query(
      `SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`,
      [customer_id]
    );
    if (custRes.rows.length === 0) throw new Error('العميل غير موجود');

    let currentAvailableCredit = Number(custRes.rows[0].total_payments || 0);
    let currentTotalDebt = Number(custRes.rows[0].customer_total || 0);

    // If return value > invoice total, apply excess as debt offset against previous invoices
    let excessAddedToCredit = 0;
    let excessDebtOffset = 0;
    const shouldAddExcess = (add_remaining_to_balance !== false && add_remaining_to_balance !== 'false');

    if (excessReturn > 0 && shouldAddExcess) {
      let remainingExcess = excessReturn;

      // ── مقاصة الزيادة: تسوية الفواتير المفتوحة السابقة (كنموذج treasury.controller.js) ──
      if (currentTotalDebt > 0 && remainingExcess > 0) {
        const outstandingRes = await client.query(
          `SELECT cb.id as cb_id, s.id as sale_id, s.remaining_balance as remaining
           FROM sales s
           LEFT JOIN customer_balances cb
             ON cb.source_id = s.id AND cb.source_type = 'sales' AND cb.branch_id = s.branch_id
           WHERE s.customer_id = $1 AND s.branch_id = $2
             AND s.remaining_balance > 0
           ORDER BY s.date ASC, s.id ASC
           FOR UPDATE OF s`,
          [customer_id, branch_id]
        );

        for (const inv of outstandingRes.rows) {
          if (remainingExcess <= 0) break;
          const canOffset = Math.min(Number(inv.remaining), remainingExcess);
          if (canOffset <= 0) continue;

          if (inv.cb_id) {
            await client.query(
              `UPDATE customer_balances
               SET paid_amount = paid_amount + $1,
                   remaining_balance = GREATEST(0, remaining_balance - $1)
               WHERE id = $2`,
              [canOffset, inv.cb_id]
            );
          }
          await client.query(
            `UPDATE sales
             SET paid_amount = paid_amount + $1,
                 remaining_balance = GREATEST(0, remaining_balance - $1)
             WHERE id = $2`,
            [canOffset, inv.sale_id]
          );

          excessDebtOffset += canOffset;
          remainingExcess -= canOffset;
        }
      }

      // ما تبقى من الزيادة يُضاف كرصيد دائن للعميل
      excessAddedToCredit = remainingExcess;
      currentTotalDebt = Math.max(0, currentTotalDebt - excessDebtOffset);
      currentAvailableCredit += excessAddedToCredit;
    }

    const useCredit = (use_customer_credit !== false && use_customer_credit !== 'false') && currentAvailableCredit > 0;
    const creditUsed = (useCredit && netInvoiceTotal > 0) ? Math.min(currentAvailableCredit, netInvoiceTotal) : 0;
    const remainingAfterCredit = netInvoiceTotal - creditUsed;

    const cashPaidToInvoice = Math.min(paid, remainingAfterCredit);
    const overpaidAmount = Math.max(0, paid - remainingAfterCredit);
    const invoicePaidAmount = creditUsed + cashPaidToInvoice;
    const remainingBeforeSettlement = remainingAfterCredit - cashPaidToInvoice;

    // Settlement / Rounding logic (تسوية باقي الفاتورة / إسقاط الكسور)
    const settlementVal = Math.max(0, Number(settlement_amount || 0));
    const effectiveSettlement = Math.min(settlementVal, remainingBeforeSettlement);
    const remainingInvoiceBalance = Math.max(0, remainingBeforeSettlement - effectiveSettlement);

    let newTotalDebt = currentTotalDebt + remainingInvoiceBalance;
    let newAvailableCredit = currentAvailableCredit - creditUsed;

    let debtOffsetFromOverpayment = 0;
    let creditAddedFromOverpayment = 0;

    if (overpaidAmount > 0) {
      if (newTotalDebt > 0) {
        debtOffsetFromOverpayment = Math.min(newTotalDebt, overpaidAmount);
        newTotalDebt -= debtOffsetFromOverpayment;
        creditAddedFromOverpayment = overpaidAmount - debtOffsetFromOverpayment;
        newAvailableCredit += creditAddedFromOverpayment;
      } else {
        creditAddedFromOverpayment = overpaidAmount;
        newAvailableCredit += creditAddedFromOverpayment;
      }
    }

    const invNoRes = await client.query(
      `SELECT COALESCE(MAX(invoice_number), 0) + 1 as next_inv FROM sales WHERE branch_id = $1`,
      [branch_id]
    );
    const invoice_number = invNoRes.rows[0].next_inv;

    const isReturnOnly = processedItems.length === 0 && returnsTotal > 0;
    let ledgerNote = isReturnOnly
      ? `فاتورة مرتجع بضاعة رقم ${invoice_number}`
      : `فاتورة مبيعات رقم ${invoice_number}`;
    if (returnsTotal > 0 && !isReturnOnly) {
      ledgerNote += ` [خصم مرتجع: ${returnsTotal.toFixed(2)} ج.م]`;
    } else if (isReturnOnly) {
      ledgerNote += ` [إجمالي المرتجع: ${returnsTotal.toFixed(2)} ج.م]`;
    }
    if (excessDebtOffset > 0) {
      ledgerNote += ` [مقاصة مديونية سابقة: ${excessDebtOffset.toFixed(2)} ج.م]`;
    }
    if (excessAddedToCredit > 0) {
      ledgerNote += ` [إضافة لرصيد العميل: ${excessAddedToCredit.toFixed(2)} ج.م]`;
    }
    if (creditUsed > 0 && paid > 0) {
      ledgerNote += ` (خصم ${creditUsed.toFixed(2)} من الرصيد + دفع نقدي ${paid.toFixed(2)})`;
    } else if (creditUsed > 0) {
      ledgerNote += ` (خصم ${creditUsed.toFixed(2)} من الرصيد المتاح)`;
    } else if (paid > 0) {
      ledgerNote += ` (سداد نقدي ${paid.toFixed(2)})`;
    }
    if (effectiveSettlement > 0) {
      ledgerNote += ` [تسوية باقي الفاتورة: ${effectiveSettlement.toFixed(2)} ج.م]`;
    }

    const firstItem = processedItems[0] || { inventory_id: null, weight: 0, price: 0 };
    const saleRes = await client.query(
      `INSERT INTO sales
       (branch_id, invoice_number, date, customer_id, inventory_id, quantity, unit_price, total, paid_amount, remaining_balance, customer_credit, notes, returns_total, gross_total, settlement_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [branch_id, invoice_number, date, customer_id,
        firstItem.inventory_id, firstItem.weight, firstItem.price,
        netInvoiceTotal, invoicePaidAmount, remainingInvoiceBalance, creditUsed, notes || ledgerNote,
        returnsTotal, grossTotal, effectiveSettlement]
    );
    const saleId = saleRes.rows[0].id;

    // Insert sold items & deduct from inventory using FIFO across companies
    for (const item of processedItems) {
      let remainingWeight = item.weight;
      let remainingRolls = item.rolls_count;

      const fifoRows = await client.query(
        `SELECT id, available_quantity, GREATEST(0, count - COALESCE(issued_rolls, 0)) AS avail_rolls
         FROM inventory
         WHERE branch_id = $1 AND LOWER(TRIM(product)) = LOWER(TRIM($2)) AND (weight_quantity - issued_quantity) > 0
         ORDER BY date ASC, id ASC
         FOR UPDATE`,
        [branch_id, item.productName]
      );

      if (fifoRows.rows.length === 0) {
        await client.query(
          `INSERT INTO sale_items (sale_id, branch_id, inventory_id, quantity, unit_price, total, weight, rolls_count, price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [saleId, branch_id, item.inventory_id, item.weight, item.price, item.lineTotal, item.weight, item.rolls_count, item.price]
        );
        await client.query(
          `UPDATE inventory 
           SET issued_quantity = issued_quantity + $1,
               issued_rolls = COALESCE(issued_rolls, 0) + $2
           WHERE id = $3`,
          [item.weight, item.rolls_count, item.inventory_id]
        );
      } else {
        for (const fRow of fifoRows.rows) {
          if (remainingWeight <= 0) break;
          const availW = Number(fRow.available_quantity);
          const availR = Number(fRow.avail_rolls);

          const deductW = Math.min(availW, remainingWeight);
          const deductR = remainingRolls > 0 ? Math.min(availR, remainingRolls) : 0;
          const deductTotal = deductW * item.price;

          await client.query(
            `UPDATE inventory 
             SET issued_quantity = issued_quantity + $1,
                 issued_rolls = COALESCE(issued_rolls, 0) + $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [deductW, deductR, fRow.id]
          );

          await client.query(
            `INSERT INTO sale_items (sale_id, branch_id, inventory_id, quantity, unit_price, total, weight, rolls_count, price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [saleId, branch_id, fRow.id, deductW, item.price, deductTotal, deductW, deductR, item.price]
          );

          remainingWeight -= deductW;
          remainingRolls -= deductR;
        }

        if (remainingWeight > 0 && fifoRows.rows.length > 0) {
          const lastId = fifoRows.rows[fifoRows.rows.length - 1].id;
          await client.query(
            `UPDATE inventory 
             SET issued_quantity = issued_quantity + $1,
                 issued_rolls = COALESCE(issued_rolls, 0) + $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [remainingWeight, remainingRolls, lastId]
          );
        }
      }
    }

    // Insert returns into returns table & add returned weight and rolls to inventory
    for (const ret of processedReturns) {
      await client.query(
        `INSERT INTO returns
           (branch_id, sale_id, customer_id, inventory_id, date, product, company, weight, rolls_count, price_per_ton, total, notes, add_to_balance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [branch_id, saleId, customer_id, ret.inventory_id, date, ret.product, ret.company, ret.weight, ret.rolls_count, ret.price_per_ton, ret.total, ret.notes, shouldAddExcess]
      );
      // Add weight and rolls count to inventory
      await client.query(
        `UPDATE inventory 
         SET weight_quantity = weight_quantity + $1,
             count = count + $2,
             updated_at = NOW()
         WHERE id = $3`,
        [ret.weight, ret.rolls_count, ret.inventory_id]
      );
    }

    const totalCreditAdded = creditAddedFromOverpayment + excessAddedToCredit;
    await client.query(
      `INSERT INTO customer_balances
       (branch_id, date, customer_id, invoice_amount, paid_amount, remaining_balance, customer_credit, source_type, source_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [branch_id, date, customer_id, netInvoiceTotal, invoicePaidAmount, remainingInvoiceBalance, totalCreditAdded, isReturnOnly ? 'returns' : 'sales', saleId, ledgerNote]
    );

    await client.query(
      `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
      [newAvailableCredit, newTotalDebt, customer_id]
    );

    if (paid > 0) {
      if (!payment_type_id) throw new Error('يجب اختيار طريقة الدفع للمبلغ المسدد');
      const ptRes = await client.query(`SELECT channel, name FROM payment_types WHERE id = $1`, [payment_type_id]);
      const channel = ptRes.rows[0]?.channel || 'cash';
      const ptName = ptRes.rows[0]?.name || 'كاش';

      let treasuryNote = `دفعة من فاتورة مبيعات رقم ${invoice_number} (${ptName})`;
      if (creditAddedFromOverpayment > 0) {
        treasuryNote += ` (${cashPaidToInvoice.toFixed(2)} سداد فاتورة + ${creditAddedFromOverpayment.toFixed(2)} رصيد دائن)`;
      }

      await client.query(
        `INSERT INTO treasury (branch_id, date, customer_id, payment_type_id, amount, notes, channel, receipt_image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [branch_id, date, customer_id, payment_type_id, paid, treasuryNote, channel, receipt_image || null]
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, saleRes.rows[0], 201, 'تم إضافة الفاتورة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message.includes('غير كافية') || err.message.includes('مطلوب') || err.message.includes('موجود')) {
      return sendError(res, err.message, 400);
    }
    next(err);
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/sales/:id
 */
const deleteSale = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;

    const saleRes = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
      [id, branch_id]
    );
    if (saleRes.rows.length === 0) throw new Error('الفاتورة غير موجودة');
    const sale = saleRes.rows[0];

    const itemsRes = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [id]);
    for (const item of itemsRes.rows) {
      const w = Number(item.weight || item.quantity || 0);
      const r = Number(item.rolls_count || 0);
      await client.query(
        `UPDATE inventory 
         SET issued_quantity = GREATEST(0, issued_quantity - $1),
             issued_rolls = GREATEST(0, COALESCE(issued_rolls, 0) - $2)
         WHERE id = $3`,
        [w, r, item.inventory_id]
      );
    }

    // Reverse returns inventory if any
    const returnsRes = await client.query(`SELECT * FROM returns WHERE sale_id = $1`, [id]);
    for (const ret of returnsRes.rows) {
      if (ret.inventory_id) {
        await client.query(
          `UPDATE inventory 
           SET weight_quantity = GREATEST(0, weight_quantity - $1),
               count = GREATEST(0, count - $2),
               updated_at = NOW()
           WHERE id = $3`,
          [Number(ret.weight || 0), Number(ret.rolls_count || 0), ret.inventory_id]
        );
      }
    }
    await client.query(`DELETE FROM returns WHERE sale_id = $1`, [id]);

    const oldBalRes = await client.query(
      `SELECT * FROM customer_balances WHERE source_type = 'sales' AND source_id = $1`,
      [id]
    );
    const oldBal = oldBalRes.rows[0] || {};
    const oldCreditUsed = Number(sale.customer_credit || 0);
    const oldRemainingDebt = Number(sale.remaining_balance || 0);
    const oldCreditGenerated = Number(oldBal.customer_credit || 0);

    await client.query(`DELETE FROM customer_balances WHERE source_type = 'sales' AND source_id = $1`, [id]);

    const custRes = await client.query(
      `SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`,
      [sale.customer_id]
    );
    if (custRes.rows.length > 0) {
      let newAvailableCredit = Math.max(0, Number(custRes.rows[0].total_payments) + oldCreditUsed - oldCreditGenerated);
      let newTotalDebt = Math.max(0, Number(custRes.rows[0].customer_total) - oldRemainingDebt);
      await client.query(
        `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
        [newAvailableCredit, newTotalDebt, sale.customer_id]
      );
    }

    await client.query(
      `DELETE FROM treasury WHERE branch_id = $1 AND (notes LIKE $2)`,
      [branch_id, `%فاتورة مبيعات رقم ${sale.invoice_number}%`]
    );

    await client.query(`DELETE FROM sales WHERE id = $1`, [id]);

    await client.query('COMMIT');
    return sendSuccess(res, null, 200, 'تم حذف الفاتورة واسترجاع الكميات والمبالغ بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/sales/:id
 */
const updateSale = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const { date, paid_amount = 0, settlement_amount = 0, payment_type_id, notes = '', items = [], use_customer_credit = true } = req.body;

    if (!items || items.length === 0) throw new Error('يجب إضافة صنف واحد على الأقل للفاتورة');

    const oldSaleRes = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
      [id, branch_id]
    );
    if (oldSaleRes.rows.length === 0) throw new Error('الفاتورة غير موجودة');
    const oldSale = oldSaleRes.rows[0];

    const oldItemsRes = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [id]);
    for (const item of oldItemsRes.rows) {
      const w = Number(item.weight || item.quantity || 0);
      const r = Number(item.rolls_count || 0);
      await client.query(
        `UPDATE inventory 
         SET issued_quantity = GREATEST(0, issued_quantity - $1),
             issued_rolls = GREATEST(0, COALESCE(issued_rolls, 0) - $2)
         WHERE id = $3`,
        [w, r, item.inventory_id]
      );
    }

    const oldBalRes = await client.query(
      `SELECT * FROM customer_balances WHERE source_type = 'sales' AND source_id = $1`,
      [id]
    );
    const oldBal = oldBalRes.rows[0] || {};
    const oldCreditUsed = Number(oldSale.customer_credit || 0);
    const oldRemainingDebt = Number(oldSale.remaining_balance || 0);
    const oldCreditGenerated = Number(oldBal.customer_credit || 0);

    const custRes = await client.query(
      `SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`,
      [oldSale.customer_id]
    );
    if (custRes.rows.length === 0) throw new Error('العميل غير موجود');
    let currentAvailableCredit = Math.max(0, Number(custRes.rows[0].total_payments) + oldCreditUsed - oldCreditGenerated);
    let currentTotalDebt = Math.max(0, Number(custRes.rows[0].customer_total) - oldRemainingDebt);

    let newInvoiceTotal = 0;
    const processedItems = [];

    for (const item of items) {
      const { inventory_id } = item;
      const weight = Number(item.weight ?? item.quantity ?? 0);
      const rolls_count = Number(item.rolls_count ?? item.count ?? 0);
      const price = Number(item.price ?? item.unit_price ?? 0);

      if (!inventory_id || weight <= 0 || price <= 0) throw new Error('بيانات كل صنف مطلوبة بشكل صحيح');
      const lineTotal = weight * price;

      const invRes = await client.query(
        `SELECT product, count, issued_rolls, weight_quantity, issued_quantity, available_quantity 
         FROM inventory WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [inventory_id, branch_id]
      );
      if (invRes.rows.length === 0) throw new Error('منتج غير موجود في المخزن');

      const invRow = invRes.rows[0];
      const availableWeight = Number(invRow.available_quantity);
      if (weight > availableWeight) {
        throw new Error(`الوزن المطلوب من "${invRow.product}" (${weight} كج) يتجاوز الوزن المتاح بالمخزن (${availableWeight.toFixed(3)} كج)`);
      }

      processedItems.push({ inventory_id, weight, rolls_count, price, lineTotal });
      newInvoiceTotal += lineTotal;
    }

    const paid = Number(paid_amount);
    const useCredit = (use_customer_credit !== false && use_customer_credit !== 'false') && currentAvailableCredit > 0;
    const creditUsed = useCredit ? Math.min(currentAvailableCredit, newInvoiceTotal) : 0;
    const remainingAfterCredit = newInvoiceTotal - creditUsed;

    const cashPaidToInvoice = Math.min(paid, remainingAfterCredit);
    const overpaidAmount = Math.max(0, paid - remainingAfterCredit);
    const invoicePaidAmount = creditUsed + cashPaidToInvoice;
    const remainingBeforeSettlement = remainingAfterCredit - cashPaidToInvoice;

    // Settlement / Rounding logic (تسوية باقي الفاتورة / إسقاط الكسور)
    const settlementVal = Math.max(0, Number(settlement_amount || 0));
    const effectiveSettlement = Math.min(settlementVal, remainingBeforeSettlement);
    const remainingInvoiceBalance = Math.max(0, remainingBeforeSettlement - effectiveSettlement);

    let newTotalDebt = currentTotalDebt + remainingInvoiceBalance;
    let newAvailableCredit = currentAvailableCredit - creditUsed;

    let debtOffsetFromOverpayment = 0;
    let creditAddedFromOverpayment = 0;

    if (overpaidAmount > 0) {
      if (newTotalDebt > 0) {
        debtOffsetFromOverpayment = Math.min(newTotalDebt, overpaidAmount);
        newTotalDebt -= debtOffsetFromOverpayment;
        creditAddedFromOverpayment = overpaidAmount - debtOffsetFromOverpayment;
        newAvailableCredit += creditAddedFromOverpayment;
      } else {
        creditAddedFromOverpayment = overpaidAmount;
        newAvailableCredit += creditAddedFromOverpayment;
      }
    }

    await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [id]);

    const updatedSaleRes = await client.query(
      `UPDATE sales
       SET date = $1, inventory_id = $2, quantity = $3, unit_price = $4,
           total = $5, paid_amount = $6, remaining_balance = $7,
           customer_credit = $8, notes = $9, settlement_amount = $10, updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [date, processedItems[0].inventory_id, processedItems[0].weight, processedItems[0].price,
        newInvoiceTotal, invoicePaidAmount, remainingInvoiceBalance, creditUsed, notes, effectiveSettlement, id]
    );

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, branch_id, inventory_id, quantity, unit_price, total, weight, rolls_count, price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, branch_id, item.inventory_id, item.weight, item.price, item.lineTotal, item.weight, item.rolls_count, item.price]
      );
      await client.query(
        `UPDATE inventory 
         SET issued_quantity = issued_quantity + $1,
             issued_rolls = COALESCE(issued_rolls, 0) + $2
         WHERE id = $3`,
        [item.weight, item.rolls_count, item.inventory_id]
      );
    }

    let ledgerNote = notes || `فاتورة مبيعات رقم ${oldSale.invoice_number}`;
    if (creditAddedFromOverpayment > 0) {
      ledgerNote += ` [إضافة ${creditAddedFromOverpayment.toFixed(2)} لرصيد العميل]`;
    }

    await client.query(
      `UPDATE customer_balances
       SET date = $1, invoice_amount = $2, paid_amount = $3, remaining_balance = $4, customer_credit = $5, notes = $6
       WHERE source_type = 'sales' AND source_id = $7`,
      [date, newInvoiceTotal, paid, remainingInvoiceBalance, creditAddedFromOverpayment,
        ledgerNote, id]
    );

    await client.query(
      `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
      [newAvailableCredit, newTotalDebt, oldSale.customer_id]
    );

    await client.query(
      `DELETE FROM treasury WHERE branch_id = $1 AND (notes LIKE $2)`,
      [branch_id, `%فاتورة مبيعات رقم ${oldSale.invoice_number}%`]
    );
    if (paid > 0) {
      if (!payment_type_id) throw new Error('يجب اختيار طريقة الدفع');
      const ptRes = await client.query(`SELECT channel, name FROM payment_types WHERE id = $1`, [payment_type_id]);
      const channel = ptRes.rows[0]?.channel || 'cash';
      const ptName = ptRes.rows[0]?.name || 'كاش';

      let treasuryNote = `دفعة من فاتورة مبيعات رقم ${oldSale.invoice_number} (${ptName})`;
      if (creditAddedFromOverpayment > 0) {
        treasuryNote += ` (${cashPaidToInvoice.toFixed(2)} سداد فاتورة + ${creditAddedFromOverpayment.toFixed(2)} رصيد دائن)`;
      }

      await client.query(
        `INSERT INTO treasury (branch_id, date, customer_id, payment_type_id, amount, notes, channel)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [branch_id, date, oldSale.customer_id, payment_type_id, paid, treasuryNote, channel]
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, updatedSaleRes.rows[0], 200, 'تم تعديل الفاتورة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message.includes('غير كافية') || err.message.includes('موجود') || err.message.includes('مطلوب')) {
      return sendError(res, err.message, 400);
    }
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { getSales, getSaleById, addSale, updateSale, deleteSale };
