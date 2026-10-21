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
             s.remaining_balance, s.customer_credit, s.notes, s.created_at, s.updated_at,
             c.name as customer_name, c.phone as customer_phone
      FROM sales s
      JOIN customers c ON c.id = s.customer_id
      WHERE s.branch_id = $1
    `;
    const params = [branch_id];
    let paramIndex = 2;

    if (customer_id) {
      query += ` AND s.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    if (inventory_id) {
      query += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.inventory_id = $${paramIndex})`;
      params.push(inventory_id);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND s.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      query += ` AND s.date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      query += ` AND s.date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    let countQuery = `SELECT COUNT(*) FROM sales s JOIN customers c ON c.id = s.customer_id WHERE s.branch_id = $1`;
    const countParams = [branch_id];
    let countIndex = 2;

    if (customer_id) {
      countQuery += ` AND s.customer_id = $${countIndex}`;
      countParams.push(customer_id);
      countIndex++;
    }
    if (inventory_id) {
      countQuery += ` AND EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.inventory_id = $${countIndex})`;
      countParams.push(inventory_id);
      countIndex++;
    }
    if (dateFrom && dateTo) {
      countQuery += ` AND s.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      countParams.push(dateFrom, dateTo);
      countIndex += 2;
    } else if (dateFrom) {
      countQuery += ` AND s.date >= $${countIndex}`;
      countParams.push(dateFrom);
      countIndex++;
    } else if (dateTo) {
      countQuery += ` AND s.date <= $${countIndex}`;
      countParams.push(dateTo);
      countIndex++;
    }

    query += ` ORDER BY s.invoice_number DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
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
      page: parseInt(page),
      limit: parseInt(limit)
    });
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
      paid_amount = 0, payment_type_id, notes = '',
      items = []
    } = req.body;

    if (!date) throw new Error('التاريخ مطلوب');
    if (!items || items.length === 0) throw new Error('يجب إضافة صنف واحد على الأقل للفاتورة');
    if (!customer_id && !customer_name) throw new Error('يجب تحديد العميل أو إدخال اسم عميل جديد');

    if (!customer_id && customer_name) {
      const isActive = saveNewCustomer !== undefined ? saveNewCustomer : true;
      const newCust = await client.query(
        `INSERT INTO customers (branch_id, name, phone, is_active) VALUES ($1, $2, $3, $4) RETURNING id`,
        [branch_id, customer_name.trim(), phone.trim(), isActive]
      );
      customer_id = newCust.rows[0].id;
    }

    const paid = Number(paid_amount);
    let invoiceTotal = 0;
    const processedItems = [];

    for (const item of items) {
      const { inventory_id, quantity, unit_price } = item;
      if (!inventory_id || !quantity || !unit_price) {
        throw new Error('بيانات كل صنف (المنتج، الكمية، السعر) مطلوبة');
      }
      const qty = Number(quantity);
      const price = Number(unit_price);
      const lineTotal = qty * price;

      const invRes = await client.query(
        `SELECT product, count, issued_quantity FROM inventory WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [inventory_id, branch_id]
      );
      if (invRes.rows.length === 0) throw new Error('المنتج غير موجود في المخزن');

      const availableCount = Number(invRes.rows[0].count) - Number(invRes.rows[0].issued_quantity);
      if (qty > availableCount) {
        throw new Error(`عدد اللفات المتاحة من "${invRes.rows[0].product}" (${availableCount}) غير كافية`);
      }

      processedItems.push({ inventory_id, qty, price, lineTotal });
      invoiceTotal += lineTotal;
    }

    const custRes = await client.query(
      `SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`,
      [customer_id]
    );
    if (custRes.rows.length === 0) throw new Error('العميل غير موجود');

    let currentAvailableCredit = Number(custRes.rows[0].total_payments);
    let currentTotalDebt = Number(custRes.rows[0].customer_total);

    const totalAvailableToPay = currentAvailableCredit + paid;
    let newAvailableCredit = 0;
    let newTotalDebt = currentTotalDebt;
    let invoicePaidAmount = 0;
    let remainingInvoiceBalance = 0;

    if (totalAvailableToPay >= invoiceTotal) {
      newAvailableCredit = totalAvailableToPay - invoiceTotal;
      invoicePaidAmount = invoiceTotal;
      remainingInvoiceBalance = 0;
    } else {
      newAvailableCredit = 0;
      invoicePaidAmount = totalAvailableToPay;
      remainingInvoiceBalance = invoiceTotal - totalAvailableToPay;
      newTotalDebt = currentTotalDebt + remainingInvoiceBalance;
    }

    const invNoRes = await client.query(
      `SELECT COALESCE(MAX(invoice_number), 0) + 1 as next_inv FROM sales WHERE branch_id = $1`,
      [branch_id]
    );
    const invoice_number = invNoRes.rows[0].next_inv;

    const creditUsed = Math.min(currentAvailableCredit, invoiceTotal);
    let ledgerNote = `فاتورة مبيعات رقم ${invoice_number}`;
    if (creditUsed > 0 && paid > 0) {
      ledgerNote += ` (خصم ${creditUsed.toFixed(2)} من الرصيد + دفع نقدي ${paid.toFixed(2)})`;
    } else if (creditUsed > 0) {
      ledgerNote += ` (خصم ${creditUsed.toFixed(2)} من الرصيد المتاح)`;
    } else if (paid > 0) {
      ledgerNote += ` (سداد نقدي ${paid.toFixed(2)})`;
    }

    const saleRes = await client.query(
      `INSERT INTO sales
       (branch_id, invoice_number, date, customer_id, inventory_id, quantity, unit_price, total, paid_amount, remaining_balance, customer_credit, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [branch_id, invoice_number, date, customer_id,
       processedItems[0].inventory_id, processedItems[0].qty, processedItems[0].price,
       invoiceTotal, invoicePaidAmount, remainingInvoiceBalance, 0, notes || ledgerNote]
    );
    const saleId = saleRes.rows[0].id;

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, branch_id, inventory_id, quantity, unit_price, total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, branch_id, item.inventory_id, item.qty, item.price, item.lineTotal]
      );
      await client.query(
        `UPDATE inventory SET issued_quantity = issued_quantity + $1 WHERE id = $2`,
        [item.qty, item.inventory_id]
      );
    }

    await client.query(
      `INSERT INTO customer_balances
       (branch_id, date, customer_id, invoice_amount, paid_amount, remaining_balance, customer_credit, source_type, source_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'sales', $8, $9)`,
      [branch_id, date, customer_id, invoiceTotal, invoicePaidAmount, remainingInvoiceBalance, 0, saleId, ledgerNote]
    );

    await client.query(
      `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
      [newAvailableCredit, newTotalDebt, customer_id]
    );

    if (paid > 0) {
      if (!payment_type_id) throw new Error('يجب اختيار طريقة الدفع للمبلغ الإضافي');
      await client.query(
        `INSERT INTO treasury (branch_id, date, customer_id, payment_type_id, amount, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [branch_id, date, customer_id, payment_type_id, paid, `دفعة من فاتورة مبيعات رقم ${invoice_number}`]
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
      await client.query(
        `UPDATE inventory SET issued_quantity = GREATEST(0, issued_quantity - $1) WHERE id = $2`,
        [item.quantity, item.inventory_id]
      );
    }

    await client.query(`DELETE FROM customer_balances WHERE source_type = 'sales' AND source_id = $1`, [id]);

    const custRes = await client.query(
      `SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`,
      [sale.customer_id]
    );
    if (custRes.rows.length > 0) {
      let newAvailableCredit = Number(custRes.rows[0].total_payments) + Number(sale.paid_amount);
      let newTotalDebt = Number(custRes.rows[0].customer_total) - Number(sale.remaining_balance);
      await client.query(
        `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
        [newAvailableCredit, newTotalDebt, sale.customer_id]
      );
    }

    await client.query(
      `DELETE FROM treasury WHERE branch_id = $1 AND (notes = $2 OR notes = $3)`,
      [branch_id,
       `دفعة نقدية من فاتورة مبيعات رقم ${sale.invoice_number}`,
       `دفعة من فاتورة مبيعات رقم ${sale.invoice_number}`]
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
    const { date, paid_amount = 0, payment_type_id, notes = '', items = [] } = req.body;

    if (!items || items.length === 0) throw new Error('يجب إضافة صنف واحد على الأقل للفاتورة');

    const oldSaleRes = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
      [id, branch_id]
    );
    if (oldSaleRes.rows.length === 0) throw new Error('الفاتورة غير موجودة');
    const oldSale = oldSaleRes.rows[0];

    const oldItemsRes = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [id]);
    for (const item of oldItemsRes.rows) {
      await client.query(
        `UPDATE inventory SET issued_quantity = GREATEST(0, issued_quantity - $1) WHERE id = $2`,
        [item.quantity, item.inventory_id]
      );
    }

    const custRes = await client.query(
      `SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`,
      [oldSale.customer_id]
    );
    if (custRes.rows.length === 0) throw new Error('العميل غير موجود');
    let currentAvailableCredit = Number(custRes.rows[0].total_payments) + Number(oldSale.paid_amount);
    let currentTotalDebt = Number(custRes.rows[0].customer_total) - Number(oldSale.remaining_balance);

    let newInvoiceTotal = 0;
    const processedItems = [];

    for (const item of items) {
      const { inventory_id, quantity, unit_price } = item;
      if (!inventory_id || !quantity || !unit_price) throw new Error('بيانات كل صنف مطلوبة');
      const qty = Number(quantity);
      const price = Number(unit_price);
      const lineTotal = qty * price;

      const invRes = await client.query(
        `SELECT product, count, issued_quantity FROM inventory WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [inventory_id, branch_id]
      );
      if (invRes.rows.length === 0) throw new Error('منتج غير موجود في المخزن');

      const availableCount = Number(invRes.rows[0].count) - Number(invRes.rows[0].issued_quantity);
      if (qty > availableCount) {
        throw new Error(`عدد اللفات المتاحة من "${invRes.rows[0].product}" (${availableCount}) غير كافية`);
      }

      processedItems.push({ inventory_id, qty, price, lineTotal });
      newInvoiceTotal += lineTotal;
    }

    const paid = Number(paid_amount);
    const totalAvailableToPay = currentAvailableCredit + paid;
    let newAvailableCredit = 0;
    let newTotalDebt = currentTotalDebt;
    let invoicePaidAmount = 0;
    let remainingInvoiceBalance = 0;

    if (totalAvailableToPay >= newInvoiceTotal) {
      newAvailableCredit = totalAvailableToPay - newInvoiceTotal;
      invoicePaidAmount = newInvoiceTotal;
      remainingInvoiceBalance = 0;
    } else {
      newAvailableCredit = 0;
      invoicePaidAmount = totalAvailableToPay;
      remainingInvoiceBalance = newInvoiceTotal - totalAvailableToPay;
      newTotalDebt = currentTotalDebt + remainingInvoiceBalance;
    }

    await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [id]);

    const updatedSaleRes = await client.query(
      `UPDATE sales
       SET date = $1, inventory_id = $2, quantity = $3, unit_price = $4,
           total = $5, paid_amount = $6, remaining_balance = $7,
           customer_credit = 0, notes = $8, updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [date, processedItems[0].inventory_id, processedItems[0].qty, processedItems[0].price,
       newInvoiceTotal, invoicePaidAmount, remainingInvoiceBalance, notes, id]
    );

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, branch_id, inventory_id, quantity, unit_price, total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, branch_id, item.inventory_id, item.qty, item.price, item.lineTotal]
      );
      await client.query(
        `UPDATE inventory SET issued_quantity = issued_quantity + $1 WHERE id = $2`,
        [item.qty, item.inventory_id]
      );
    }

    await client.query(
      `UPDATE customer_balances
       SET date = $1, invoice_amount = $2, paid_amount = $3, remaining_balance = $4, customer_credit = 0, notes = $5
       WHERE source_type = 'sales' AND source_id = $6`,
      [date, newInvoiceTotal, invoicePaidAmount, remainingInvoiceBalance,
       `تعديل فاتورة مبيعات رقم ${oldSale.invoice_number}`, id]
    );

    await client.query(
      `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
      [newAvailableCredit, newTotalDebt, oldSale.customer_id]
    );

    await client.query(
      `DELETE FROM treasury WHERE branch_id = $1 AND (notes = $2 OR notes = $3)`,
      [branch_id,
       `دفعة نقدية من فاتورة مبيعات رقم ${oldSale.invoice_number}`,
       `دفعة من فاتورة مبيعات رقم ${oldSale.invoice_number}`]
    );
    if (paid > 0) {
      if (!payment_type_id) throw new Error('يجب اختيار طريقة الدفع');
      await client.query(
        `INSERT INTO treasury (branch_id, date, customer_id, payment_type_id, amount, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [branch_id, date, oldSale.customer_id, payment_type_id, paid,
         `دفعة من فاتورة مبيعات رقم ${oldSale.invoice_number}`]
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

module.exports = { getSales, addSale, updateSale, deleteSale };
