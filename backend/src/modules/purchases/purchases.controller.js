const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * GET /api/purchases
 */
const getPurchases = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { customer_id, product, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = `
      SELECT p.*, COALESCE(c.name, 'بدون مورد') as customer_name 
      FROM purchases p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.branch_id = $1
    `;
    const params = [branch_id];
    let paramIndex = 2;

    if (customer_id) {
      query += ` AND p.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    if (product) {
      query += ` AND p.product ILIKE $${paramIndex}`;
      params.push(`%${product}%`);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND p.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      query += ` AND p.date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      query += ` AND p.date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ` ORDER BY p.date DESC, p.id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    let countQuery = `
      SELECT COUNT(*) FROM purchases p 
      LEFT JOIN customers c ON c.id = p.customer_id 
      WHERE p.branch_id = $1`;
    const countParams = [branch_id];
    let countIndex = 2;

    if (customer_id) {
      countQuery += ` AND p.customer_id = $${countIndex}`;
      countParams.push(customer_id);
      countIndex++;
    }

    if (product) {
      countQuery += ` AND p.product ILIKE $${countIndex}`;
      countParams.push(`%${product}%`);
      countIndex++;
    }

    if (dateFrom && dateTo) {
      countQuery += ` AND p.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      countParams.push(dateFrom, dateTo);
      countIndex += 2;
    } else if (dateFrom) {
      countQuery += ` AND p.date >= $${countIndex}`;
      countParams.push(dateFrom);
      countIndex++;
    } else if (dateTo) {
      countQuery += ` AND p.date <= $${countIndex}`;
      countParams.push(dateTo);
      countIndex++;
    }

    const countResult = await pool.query(countQuery, countParams);

    return sendSuccess(res, {
      purchases: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/purchases
 */
const addPurchase = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    let { 
      date, customer_id, customer_name, phone = '', saveNewCustomer, product, quantity = 0, 
      discount = 0, total, notes = '' 
    } = req.body;

    if (!date || !product || !total) {
      throw new Error('التاريخ، المنتج، والمبلغ الإجمالي مطلوبة');
    }

    // Create customer if name provided, skip if neither given
    if (!customer_id && customer_name && customer_name.trim()) {
      const isActive = saveNewCustomer !== false && saveNewCustomer !== 'false';
      const custRes = await client.query(
        `INSERT INTO customers (branch_id, name, phone, is_active) VALUES ($1, $2, $3, $4) RETURNING id`,
        [branch_id, customer_name.trim(), phone.trim(), isActive]
      );
      customer_id = custRes.rows[0].id;
    }

    // If still no customer, use null (no supplier)
    const finalCustomerId = customer_id || null;
    const invoiceTotal = Number(total);
    const applyDebtOffset = req.body.apply_debt_offset === true || req.body.apply_debt_offset === 'true';

    // Determine available credit (only if supplier exists)
    let credit_used = 0;
    let debt_offset = 0;
    let treasury_paid = invoiceTotal;

    if (finalCustomerId) {
      const balRes = await client.query(
        `SELECT (customer_total - total_payments) as balance FROM customers WHERE id = $1`, 
        [finalCustomerId]
      );
      const balance = Number(balRes.rows[0].balance);
      
      // Case 1: Customer has credit (overpaid us), use it to reduce our treasury payout
      let available_credit = balance < 0 ? Math.abs(balance) : 0;
      if (available_credit > 0) {
        if (available_credit >= invoiceTotal) {
          credit_used = invoiceTotal;
          treasury_paid = 0;
        } else {
          credit_used = available_credit;
          treasury_paid = invoiceTotal - available_credit;
        }
      }

      // Case 2: Customer has debt AND user confirmed debt offset
      // We offset their debt against what we owe them for this purchase
      if (applyDebtOffset && balance > 0) {
        // Get outstanding invoices oldest first
        const outstandingRes = await client.query(
          `SELECT cb.id, cb.source_id, cb.invoice_amount, cb.paid_amount, (cb.invoice_amount - cb.paid_amount) as remaining
           FROM customer_balances cb
           WHERE cb.customer_id = $1 AND cb.branch_id = $2
             AND cb.source_type = 'sales'
             AND (cb.invoice_amount - cb.paid_amount) > 0
           ORDER BY cb.id ASC
           FOR UPDATE`,
          [finalCustomerId, branch_id]
        );

        let remainingOffset = invoiceTotal; // we offset up to what we owe them
        for (const inv of outstandingRes.rows) {
          if (remainingOffset <= 0) break;
          const canOffset = Math.min(Number(inv.remaining), remainingOffset);
          if (canOffset <= 0) continue;

          // Update customer_balances: paid_amount ↑, remaining_balance ↓
          await client.query(
            `UPDATE customer_balances
             SET paid_amount = paid_amount + $1,
                 remaining_balance = GREATEST(0, remaining_balance - $1)
             WHERE id = $2`,
            [canOffset, inv.id]
          );

          // Update the sales record itself: paid_amount ↑, remaining_balance ↓
          await client.query(
            `UPDATE sales
             SET paid_amount = paid_amount + $1,
                 remaining_balance = GREATEST(0, remaining_balance - $1)
             WHERE id = $2`,
            [canOffset, inv.source_id]
          );

          debt_offset += canOffset;
          remainingOffset -= canOffset;
        }

        // Update customer debt to reflect the debt being cleared
        if (debt_offset > 0) {
          await client.query(
            `UPDATE customers SET customer_total = GREATEST(0, customer_total - $1) WHERE id = $2`,
            [debt_offset, finalCustomerId]
          );
          // Treasury pays only the difference (what's left after debt offset)
          treasury_paid = Math.max(0, invoiceTotal - debt_offset - credit_used);
        }
      }
    }

    const qtyAfterDisc = Number(quantity) - Number(discount);

    // Insert purchase
    const result = await client.query(
      `INSERT INTO purchases (branch_id, date, customer_id, product, quantity, discount, quantity_after_discount, total, treasury_balance, credit_used, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [branch_id, date, finalCustomerId, product, quantity, discount, qtyAfterDisc, invoiceTotal, treasury_paid, credit_used + debt_offset, notes]
    );
    const purchaseId = result.rows[0].id;

    // Only add customer_balance record if supplier exists
    if (finalCustomerId) {
      const notesText = applyDebtOffset && debt_offset > 0
        ? `فاتورة مشتريات (مقاصة دين ${debt_offset.toFixed(2)})`
        : `فاتورة مشتريات (استخدام رصيد/خزينة)`;
      await client.query(
        `INSERT INTO customer_balances (branch_id, date, customer_id, invoice_amount, paid_amount, source_type, source_id, notes)
         VALUES ($1, $2, $3, $4, 0, 'purchases', $5, $6)`,
        [branch_id, date, finalCustomerId, invoiceTotal, purchaseId, notesText]
      );
    }

    // ── Optional: Add directly to Inventory if requested ───────────────────
    const addToInventory = req.body.add_to_inventory === true || req.body.add_to_inventory === 'true';
    if (addToInventory) {
      const invCompany = req.body.inventory_company ? String(req.body.inventory_company).trim() : '';
      const invProduct = String(product).trim();
      const invCount = Number(req.body.inventory_count || 0);
      const invWeight = Number(req.body.inventory_weight !== undefined && req.body.inventory_weight !== '' ? req.body.inventory_weight : qtyAfterDisc);
      const invRollPrice = Number(req.body.inventory_roll_price || 0);

      // Check if product already exists in inventory
      const existingInv = await client.query(
        `SELECT id, count, weight_quantity, roll_price FROM inventory 
         WHERE product ILIKE $1 AND COALESCE(company, '') = COALESCE($2, '') AND branch_id = $3
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [invProduct, invCompany, branch_id]
      );

      let inventoryId;
      if (existingInv.rows.length > 0) {
        const cur = existingInv.rows[0];
        const newCount = Number(cur.count) + invCount;
        const newWeight = Number(cur.weight_quantity) + invWeight;
        const activePrice = invRollPrice > 0 ? invRollPrice : Number(cur.roll_price);
        const newTotal = newCount * activePrice;

        const updatedInv = await client.query(
          `UPDATE inventory 
           SET date = $1, count = $2, weight_quantity = $3, roll_price = $4, total = $5, updated_at = NOW()
           WHERE id = $6 RETURNING id`,
          [date, newCount, newWeight, activePrice, newTotal, cur.id]
        );
        inventoryId = updatedInv.rows[0].id;
      } else {
        const totalValue = invCount * invRollPrice;
        const insertedInv = await client.query(
          `INSERT INTO inventory (branch_id, date, company, product, weight_quantity, count, roll_price, total, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [branch_id, date, invCompany, invProduct, invWeight, invCount, invRollPrice, totalValue, `وارد من فاتورة مشتريات #${purchaseId}`]
        );
        inventoryId = insertedInv.rows[0].id;
      }

      await client.query(
        `UPDATE purchases SET transferred_to_inventory = true, inventory_id = $1 WHERE id = $2`,
        [inventoryId, purchaseId]
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, { ...result.rows[0], transferred_to_inventory: addToInventory }, 201, 'تم تسجيل المشتريات بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/purchases/:id
 * Simplified edit. For strict accounting, full reversion is usually required.
 */
const updatePurchase = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const { date, product, quantity = 0, discount = 0, total, notes = '' } = req.body;

    const oldRes = await client.query(`SELECT * FROM purchases WHERE id = $1 AND branch_id = $2 FOR UPDATE`, [id, branch_id]);
    if (oldRes.rows.length === 0) throw new Error('المشتريات غير موجودة');
    
    const qtyAfterDisc = Number(quantity) - Number(discount);
    const invoiceTotal = Number(total);

    // We keep credit_used same, adjust treasury_paid
    const oldCredit = Number(oldRes.rows[0].credit_used);
    let newTreasuryPaid = invoiceTotal - oldCredit;
    if (newTreasuryPaid < 0) newTreasuryPaid = 0; // If total drops below used credit, we should technically restore credit, but keep it simple

    const result = await client.query(
      `UPDATE purchases 
       SET date = $1, product = $2, quantity = $3, discount = $4, quantity_after_discount = $5, 
           total = $6, treasury_balance = $7, notes = $8, updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [date, product, quantity, discount, qtyAfterDisc, invoiceTotal, newTreasuryPaid, notes, id]
    );

    // Update customer balance record
    await client.query(
      `UPDATE customer_balances
       SET date = $1, invoice_amount = $2, notes = $3
       WHERE source_type = 'purchases' AND source_id = $4`,
      [date, invoiceTotal, `تعديل فاتورة مشتريات`, id]
    );

    // Removed automatic customer totals update as per requirement

    await client.query('COMMIT');
    return sendSuccess(res, result.rows[0], 200, 'تم تحديث المشتريات بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/purchases/:id
 */
const deletePurchase = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;

    // Delete associated customer_balance
    await client.query(`DELETE FROM customer_balances WHERE source_type = 'purchases' AND source_id = $1 AND branch_id = $2`, [id, branch_id]);

    const result = await client.query(
      `DELETE FROM purchases WHERE id = $1 AND branch_id = $2 RETURNING id`,
      [id, branch_id]
    );

    if (!result.rows[0]) throw new Error('المشتريات غير موجودة');

    await client.query('COMMIT');
    return sendSuccess(res, null, 200, 'تم حذف المشتريات بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message === 'المشتريات غير موجودة') return sendError(res, err.message, 404);
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/purchases/:id/transfer-to-inventory
 * Transfer an existing purchase to inventory
 */
const transferToInventory = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const { company = '', count, roll_price, weight_quantity } = req.body;

    const purRes = await client.query(`SELECT * FROM purchases WHERE id = $1 AND branch_id = $2 FOR UPDATE`, [id, branch_id]);
    if (purRes.rows.length === 0) throw new Error('فاتورة المشتريات غير موجودة');
    const purchase = purRes.rows[0];

    if (purchase.transferred_to_inventory) {
      throw new Error('تم ترحيل هذه المشتريات إلى المخزن مسبقاً');
    }

    const invCompany = company ? String(company).trim() : '';
    const invProduct = String(purchase.product).trim();
    const invCount = Number(count || 0);
    const invWeight = Number(weight_quantity !== undefined && weight_quantity !== '' ? weight_quantity : (purchase.quantity_after_discount || purchase.quantity || 0));
    const invRollPrice = Number(roll_price || 0);

    if (invCount <= 0 && invWeight <= 0) {
      throw new Error('يرجى تحديد عدد اللفات أو وزن البضاعة المدخلة للمخزن');
    }

    const existingInv = await client.query(
      `SELECT id, count, weight_quantity, roll_price FROM inventory 
       WHERE product ILIKE $1 AND COALESCE(company, '') = COALESCE($2, '') AND branch_id = $3
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [invProduct, invCompany, branch_id]
    );

    let inventoryId;
    if (existingInv.rows.length > 0) {
      const cur = existingInv.rows[0];
      const newCount = Number(cur.count) + invCount;
      const newWeight = Number(cur.weight_quantity) + invWeight;
      const activePrice = invRollPrice > 0 ? invRollPrice : Number(cur.roll_price);
      const newTotal = newCount * activePrice;

      const updatedInv = await client.query(
        `UPDATE inventory 
         SET count = $1, weight_quantity = $2, roll_price = $3, total = $4, updated_at = NOW()
         WHERE id = $5 RETURNING id`,
        [newCount, newWeight, activePrice, newTotal, cur.id]
      );
      inventoryId = updatedInv.rows[0].id;
    } else {
      const totalValue = invCount * invRollPrice;
      const insertedInv = await client.query(
        `INSERT INTO inventory (branch_id, date, company, product, weight_quantity, count, roll_price, total, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [branch_id, purchase.date, invCompany, invProduct, invWeight, invCount, invRollPrice, totalValue, `وارد من فاتورة مشتريات #${id}`]
      );
      inventoryId = insertedInv.rows[0].id;
    }

    await client.query(
      `UPDATE purchases SET transferred_to_inventory = true, inventory_id = $1 WHERE id = $2`,
      [inventoryId, id]
    );

    await client.query('COMMIT');
    return sendSuccess(res, { inventory_id: inventoryId }, 200, 'تم ترحيل المشتريات إلى المخزن بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/purchases/unique
 */
const getUniqueValues = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    
    const productsRes = await pool.query(
      `SELECT DISTINCT product FROM purchases WHERE branch_id = $1 AND product IS NOT NULL AND product != '' ORDER BY product`,
      [branch_id]
    );

    return sendSuccess(res, {
      products: productsRes.rows.map(r => r.product)
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPurchases, addPurchase, updatePurchase, deletePurchase, getUniqueValues, transferToInventory };

