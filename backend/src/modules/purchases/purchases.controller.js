const pool = require('../../config/db');
const { sendSuccess, sendError, paginate, getEffectiveBranchId } = require('../../utils/helpers');
const { getCurrentTreasuryBalance } = require('../treasury/treasury.controller');

/**
 * GET /api/purchases
 * Returns purchase records with optional inventory info
 */
const getPurchases = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { customer_id, product, dateFrom, dateTo, material_type, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let where = branch_id ? `WHERE p.branch_id = $1` : `WHERE 1=1`;
    const params = branch_id ? [branch_id] : [];
    let idx = params.length + 1;

    if (customer_id) {
      const ids = customer_id.split(',').map(v => v.trim()).filter(Boolean);
      if (ids.length === 1) { where += ` AND p.customer_id = $${idx}`; params.push(ids[0]); idx++; }
      else { where += ` AND p.customer_id = ANY($${idx}::int[])`; params.push(ids.map(Number)); idx++; }
    }

    if (material_type) {
      const types = material_type.split(',').map(v => v.trim()).filter(Boolean);
      if (types.length === 1) { where += ` AND p.material_type = $${idx}`; params.push(types[0]); idx++; }
      else { where += ` AND p.material_type = ANY($${idx}::text[])`; params.push(types); idx++; }
    }

    if (product) {
      const prods = product.split(',').map(v => v.trim()).filter(Boolean);
      if (prods.length === 1) { where += ` AND p.product ILIKE $${idx}`; params.push(`%${prods[0]}%`); idx++; }
      else { where += ` AND p.product = ANY($${idx}::text[])`; params.push(prods); idx++; }
    }

    if (dateFrom && dateTo) { where += ` AND p.date BETWEEN $${idx} AND $${idx + 1}`; params.push(dateFrom, dateTo); idx += 2; }
    else if (dateFrom) { where += ` AND p.date >= $${idx}`; params.push(dateFrom); idx++; }
    else if (dateTo) { where += ` AND p.date <= $${idx}`; params.push(dateTo); idx++; }

    const dataQuery = `
      SELECT
        p.*,
        COALESCE(p.scale_ticket_image, inv.scale_ticket_image) AS scale_ticket_image_merged,
        COALESCE(c.name, 'بدون مورد') AS customer_name,
        inv.issued_quantity,
        inv.issued_rolls,
        GREATEST(0, COALESCE(p.weight_quantity,0) - COALESCE(inv.issued_quantity,0)) AS remaining_weight,
        GREATEST(0, COALESCE(p.count,0)           - COALESCE(inv.issued_rolls,0))    AS remaining_rolls
      FROM purchases p
      LEFT JOIN customers c   ON c.id = p.customer_id
      LEFT JOIN inventory inv ON inv.id = p.inventory_id
      ${where}
      ORDER BY p.date DESC, p.id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limit, offset);

    const countParams = params.slice(0, params.length - 2);
    const countQuery = `SELECT COUNT(*) FROM purchases p ${where}`;

    const summaryQuery = `
      SELECT
        COALESCE(SUM(p.total),0)            AS total_purchases,
        COALESCE(SUM(p.treasury_balance),0) AS total_treasury_out,
        COALESCE(SUM(p.weight_quantity),0)  AS total_weight,
        COALESCE(SUM(p.count),0)            AS total_rolls,
        COUNT(*)                             AS invoice_count
      FROM purchases p
      ${where}
    `;

    const [dataRes, countRes, summaryRes] = await Promise.all([
      pool.query(dataQuery, params),
      pool.query(countQuery, countParams),
      pool.query(summaryQuery, countParams),
    ]);

    return sendSuccess(res, {
      purchases: dataRes.rows,
      summary: summaryRes.rows[0],
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/purchases
 * Creates a purchase record.
 * If add_to_inventory=true, also stocks inventory immediately.
 * Otherwise sets transferred_to_inventory=false and user can transfer later.
 */
const addPurchase = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    let {
      date, customer_id, customer_name, phone = '', saveNewCustomer,
      product, company = '',
      weight_quantity = 0, count = 0,
      price_per_ton = 0, price_per_kg = 0, roll_price = 0,
      discount = 0, total, notes = '',
      apply_debt_offset, channel = 'cash',
      receipt_image = null, scale_ticket_image = null,
      material_type = 'section',
      image_url = null,
      add_to_inventory = false,
    } = req.body;

    if (!date || !product || !total) throw new Error('التاريخ، المنتج، والمبلغ الإجمالي مطلوبة');

    const effWeight = Number(weight_quantity || req.body.quantity || 0);
    const effCount = Number(count || req.body.inventory_count || 0);
    const effCompany = company || req.body.inventory_company || '';

    // ── Derive price fields ──────────────────────────────────────────────
    const pTon = Number(price_per_ton);
    let pKg = Number(price_per_kg);
    let pRoll = Number(roll_price || req.body.inventory_roll_price || 0);

    if (pTon > 0 && pKg === 0) pKg = pTon / 1000;
    if (pTon > 0 && pRoll === 0 && effWeight > 0 && effCount > 0) {
      pRoll = (effWeight / effCount) * pKg;
    }

    // ── Customer handling ────────────────────────────────────────────────
    if (!customer_id && customer_name && customer_name.trim()) {
      const isActive = saveNewCustomer !== false && saveNewCustomer !== 'false';
      const custRes = await client.query(
        `INSERT INTO customers (branch_id, name, phone, is_active) VALUES ($1,$2,$3,$4) RETURNING id`,
        [branch_id, customer_name.trim(), phone.trim(), isActive]
      );
      customer_id = custRes.rows[0].id;
    }
    const finalCustomerId = customer_id || null;
    const invoiceTotal = Number(total);
    const applyDebtOffset = apply_debt_offset === true || apply_debt_offset === 'true';
    const addToInventory = add_to_inventory === true || add_to_inventory === 'true';

    // ── Treasury / credit / debt-offset logic ───────────────────────────
    let credit_used = 0, debt_offset = 0, treasury_paid = invoiceTotal;

    if (finalCustomerId) {
      const balRes = await client.query(
        `SELECT (customer_total - total_payments) as balance FROM customers WHERE id = $1`,
        [finalCustomerId]
      );
      const balance = Number(balRes.rows[0].balance);
      const available_credit = balance < 0 ? Math.abs(balance) : 0;
      if (available_credit >= invoiceTotal) { credit_used = invoiceTotal; treasury_paid = 0; }
      else if (available_credit > 0) { credit_used = available_credit; treasury_paid = invoiceTotal - available_credit; }

      if (applyDebtOffset && balance > 0) {
        const outstandingRes = await client.query(
          `SELECT cb.id, cb.source_id, (cb.invoice_amount - cb.paid_amount) as remaining
           FROM customer_balances cb
           WHERE cb.customer_id=$1 AND cb.branch_id=$2 AND cb.source_type='sales'
             AND (cb.invoice_amount - cb.paid_amount) > 0
           ORDER BY cb.id ASC FOR UPDATE`,
          [finalCustomerId, branch_id]
        );
        let remaining = invoiceTotal;
        for (const inv of outstandingRes.rows) {
          if (remaining <= 0) break;
          const can = Math.min(Number(inv.remaining), remaining);
          if (can <= 0) continue;
          await client.query(
            `UPDATE customer_balances SET paid_amount=paid_amount+$1, remaining_balance=GREATEST(0,remaining_balance-$1) WHERE id=$2`,
            [can, inv.id]
          );
          await client.query(
            `UPDATE sales SET paid_amount=paid_amount+$1, remaining_balance=GREATEST(0,remaining_balance-$1) WHERE id=$2`,
            [can, inv.source_id]
          );
          debt_offset += can; remaining -= can;
        }
        if (debt_offset > 0) {
          await client.query(
            `UPDATE customers SET customer_total=GREATEST(0,customer_total-$1) WHERE id=$2`,
            [debt_offset, finalCustomerId]
          );
          treasury_paid = Math.max(0, invoiceTotal - debt_offset - credit_used);
        }
      }
    }

    const qtyAfterDisc = effWeight - Number(discount);

    // ── Check treasury liquidity to prevent negative balances ─────────────
    if (treasury_paid > 0) {
      const treasuryBal = await getCurrentTreasuryBalance(branch_id);
      const purChannel = channel || 'cash';
      const availLiquidity = Number(treasuryBal?.channels?.[purChannel] ?? treasuryBal?.total ?? 0);
      if (treasury_paid > availLiquidity) {
        const chNames = { cash: 'نقدي (كاش)', wallet: 'محفظة إلكترونية', instapay: 'انستاباي', bank: 'إيداع بنكي' };
        const chName = chNames[purChannel] || purChannel;
        await client.query('ROLLBACK');
        return sendError(
          res,
          `رصيد الخزينة المتاح في قناة (${chName}) هو ${availLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م، ولا يكفي لسداد قيمة الفاتورة النقدية المطلوبة (${treasury_paid.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م). تم منع العملية لتفادي الأرصدة السالبة بالخزينة.`,
          400
        );
      }
    }

    // ── Insert purchase record ───────────────────────────────────────────
    const purRes = await client.query(
      `INSERT INTO purchases
         (branch_id, date, customer_id, product, company,
          weight_quantity, count, roll_price, price_per_kg, price_per_ton,
          quantity, discount, quantity_after_discount,
          total, treasury_balance, credit_used, notes,
          transferred_to_inventory, channel, receipt_image, scale_ticket_image, material_type, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, false, $18, $19, $20, $21, $22)
       RETURNING *`,
      [
        branch_id, date, finalCustomerId, product, effCompany,
        effWeight, effCount, pRoll, pKg, pTon,
        effWeight, Number(discount), qtyAfterDisc,
        invoiceTotal, treasury_paid, credit_used + debt_offset, notes,
        channel || 'cash', receipt_image || null, scale_ticket_image || null,
        material_type || 'section', image_url || null,
      ]
    );
    const purchaseId = purRes.rows[0].id;

    // ── Customer balance entry ───────────────────────────────────────────
    if (finalCustomerId) {
      const notesText = applyDebtOffset && debt_offset > 0
        ? `فاتورة مشتريات (مقاصة دين ${debt_offset.toFixed(2)})`
        : `فاتورة مشتريات (استخدام رصيد/خزينة)`;
      await client.query(
        `INSERT INTO customer_balances (branch_id, date, customer_id, invoice_amount, paid_amount, source_type, source_id, notes)
         VALUES ($1,$2,$3,$4,0,'purchases',$5,$6)`,
        [branch_id, date, finalCustomerId, invoiceTotal, purchaseId, notesText]
      );
    }

    // ── Stock inventory if requested ─────────────────────────────────────
    let inventoryId = null;
    if (addToInventory) {
      inventoryId = await _stockInventory(client, {
        branch_id, date, product, company: effCompany,
        weight_quantity: effWeight,
        count: effCount,
        pRoll, pKg, scale_ticket_image, purchaseId,
      });
      await client.query(
        `UPDATE purchases SET transferred_to_inventory=true, inventory_id=$1 WHERE id=$2`,
        [inventoryId, purchaseId]
      );
    }

    await client.query('COMMIT');

    const msg = addToInventory
      ? 'تم تسجيل الفاتورة وتوريد المخزن بنجاح'
      : 'تم تسجيل الفاتورة بنجاح (يمكن ترحيلها للمخزن لاحقاً)';

    return sendSuccess(res, {
      ...purRes.rows[0],
      inventory_id: inventoryId,
      transferred_to_inventory: addToInventory,
    }, 201, msg);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/purchases/:id/transfer
 * Transfers a purchase to inventory (when transferred_to_inventory=false)
 */
const transferPurchaseToInventory = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;

    const purRes = await client.query(
      `SELECT * FROM purchases WHERE id=$1 AND branch_id=$2 FOR UPDATE`,
      [id, branch_id]
    );
    if (purRes.rows.length === 0) throw new Error('الفاتورة غير موجودة');

    const p = purRes.rows[0];
    if (p.transferred_to_inventory) {
      return sendError(res, 'هذه الفاتورة تم ترحيلها للمخزن مسبقاً', 400);
    }

    const pKg = Number(p.price_per_kg);
    const pRoll = Number(p.roll_price);
    const invWeight = Number(p.weight_quantity || p.quantity_after_discount || p.quantity || 0);
    const invCount = Number(p.count || 0);

    const inventoryId = await _stockInventory(client, {
      branch_id,
      date: p.date,
      product: p.product,
      company: p.company || '',
      weight_quantity: invWeight,
      count: invCount,
      pRoll,
      pKg,
      scale_ticket_image: p.scale_ticket_image,
      purchaseId: p.id,
    });

    await client.query(
      `UPDATE purchases SET transferred_to_inventory=true, inventory_id=$1, updated_at=NOW() WHERE id=$2`,
      [inventoryId, id]
    );

    await client.query('COMMIT');
    return sendSuccess(res, { inventory_id: inventoryId, transferred_to_inventory: true }, 200, 'تم ترحيل الفاتورة للمخزن بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message.includes('غير موجودة')) return sendError(res, err.message, 404);
    next(err);
  } finally {
    client.release();
  }
};

/**
 * Helper: stock or update inventory entry.
 * Returns the inventory id.
 */
async function _stockInventory(client, { branch_id, date, product, company, weight_quantity, count, pRoll, pKg, scale_ticket_image, purchaseId }) {
  const invProduct = String(product).trim();
  const invCompany = String(company || '').trim();
  const totalValue = count > 0 ? count * pRoll : weight_quantity * pKg;

  // 1. Record immutable supply entry in inventory_supplies
  await client.query(
    `INSERT INTO inventory_supplies 
     (branch_id, date, company, product, weight_quantity, count, price_per_kg, roll_price, total, purchase_id, scale_ticket_image, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [branch_id, date, invCompany, invProduct, weight_quantity, count, pKg, pRoll, totalValue, purchaseId, scale_ticket_image || null, `وارد من فاتورة مشتريات #${purchaseId}`]
  );

  // 2. Group by product and company
  const existingInv = await client.query(
    `SELECT id, count, weight_quantity, company, roll_price, price_per_kg FROM inventory
     WHERE LOWER(TRIM(product)) = LOWER(TRIM($1)) 
       AND LOWER(TRIM(COALESCE(company, ''))) = LOWER(TRIM($2))
       AND branch_id = $3
     ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [invProduct, invCompany, branch_id]
  );

  let inventoryId;
  if (existingInv.rows.length > 0) {
    const cur = existingInv.rows[0];
    const newCount = Number(cur.count) + count;
    const newWeight = Number(cur.weight_quantity) + weight_quantity;
    const effectiveRollPrice = pRoll || Number(cur.roll_price) || 0;
    const effectivePricePerKg = pKg || Number(cur.price_per_kg) || 0;
    const newTotal = newCount > 0 ? newCount * effectiveRollPrice : newWeight * effectivePricePerKg;

    const updInv = await client.query(
      `UPDATE inventory
       SET date=$1, count=$2, weight_quantity=$3, roll_price=$4, price_per_kg=$5, total=$6,
           scale_ticket_image=COALESCE($8, scale_ticket_image), updated_at=NOW()
       WHERE id=$7 RETURNING id`,
      [date, newCount, newWeight, effectiveRollPrice, effectivePricePerKg, newTotal, cur.id, scale_ticket_image || null]
    );
    inventoryId = updInv.rows[0].id;
  } else {
    const insInv = await client.query(
      `INSERT INTO inventory (branch_id, date, company, product, weight_quantity, count, roll_price, price_per_kg, total, notes, scale_ticket_image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [branch_id, date, invCompany, invProduct, weight_quantity, count, pRoll, pKg, totalValue,
        `وارد من فاتورة مشتريات #${purchaseId}`, scale_ticket_image || null]
    );
    inventoryId = insInv.rows[0].id;
  }
  return inventoryId;
}

/**
 * PUT /api/purchases/:id
 */
const updatePurchase = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const {
      date, product, company = '',
      weight_quantity = 0, count = 0,
      price_per_ton = 0, price_per_kg = 0, roll_price = 0,
      discount = 0, total, notes = '',
      channel = 'cash', receipt_image = null, scale_ticket_image = null,
      material_type, image_url = null,
    } = req.body;

    const oldRes = await client.query(
      `SELECT * FROM purchases WHERE id=$1 AND branch_id=$2 FOR UPDATE`,
      [id, branch_id]
    );
    if (oldRes.rows.length === 0) throw new Error('المشتريات غير موجودة');

    const pTon = Number(price_per_ton);
    let pKg = Number(price_per_kg);
    let pRoll = Number(roll_price);
    if (pTon > 0 && pKg === 0) pKg = pTon / 1000;
    if (pTon > 0 && pRoll === 0 && Number(weight_quantity) > 0 && Number(count) > 0) {
      pRoll = (Number(weight_quantity) / Number(count)) * pKg;
    }

    const invoiceTotal = Number(total);
    const oldCredit = Number(oldRes.rows[0].credit_used);
    const oldTreasury = Number(oldRes.rows[0].treasury_balance || 0);
    const newTreasury = Math.max(0, invoiceTotal - oldCredit);

    // ── Check treasury liquidity on increase ─────────────────────────────
    if (newTreasury > oldTreasury) {
      const treasuryBal = await getCurrentTreasuryBalance(branch_id);
      const purChannel = channel || oldRes.rows[0].channel || 'cash';
      const availLiquidity = Number(treasuryBal?.channels?.[purChannel] ?? treasuryBal?.total ?? 0);
      const diff = newTreasury - oldTreasury;
      if (diff > availLiquidity) {
        const chNames = { cash: 'نقدي (كاش)', wallet: 'محفظة إلكترونية', instapay: 'انستاباي', bank: 'إيداع بنكي' };
        const chName = chNames[purChannel] || purChannel;
        await client.query('ROLLBACK');
        return sendError(
          res,
          `رصيد الخزينة المتاح في قناة (${chName}) هو ${availLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م، ولا يكفي لتغطية زيادة المدفوع من الخزينة (${diff.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م). تم منع العملية لتفادي الأرصدة السالبة بالخزينة.`,
          400
        );
      }
    }

    const qtyAfterDisc = Number(weight_quantity) - Number(discount);

    const result = await client.query(
      `UPDATE purchases
       SET date=$1, product=$2, company=$3,
           weight_quantity=$4, count=$5, roll_price=$6, price_per_kg=$7, price_per_ton=$8,
           quantity=$4, discount=$9, quantity_after_discount=$10,
           total=$11, treasury_balance=$12, notes=$13,
           channel=COALESCE($15, channel),
           receipt_image=COALESCE($16, receipt_image),
           scale_ticket_image=COALESCE($17, scale_ticket_image),
           material_type=COALESCE($18, material_type),
           image_url=COALESCE($19, image_url),
           updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [date, product, company,
        Number(weight_quantity), Number(count), pRoll, pKg, pTon,
        Number(discount), qtyAfterDisc,
        invoiceTotal, newTreasury, notes, id,
        channel || null, receipt_image || null, scale_ticket_image || null,
        material_type || null, image_url || null]
    );

    await client.query(
      `UPDATE customer_balances SET date=$1, invoice_amount=$2, notes='تعديل فاتورة مشتريات'
       WHERE source_type='purchases' AND source_id=$3`,
      [date, invoiceTotal, id]
    );

    // Sync linked inventory only if already transferred
    const invId = oldRes.rows[0].inventory_id;
    const wasTransferred = oldRes.rows[0].transferred_to_inventory;
    if (invId && wasTransferred) {
      const invRes = await client.query(
        `SELECT issued_quantity, issued_rolls FROM inventory WHERE id=$1 FOR UPDATE`, [invId]
      );
      if (invRes.rows.length > 0) {
        const issuedQty = Number(invRes.rows[0].issued_quantity);
        const issuedRolls = Number(invRes.rows[0].issued_rolls);
        const newCount = Math.max(Number(count), issuedRolls);
        const newWeight = Math.max(Number(weight_quantity), issuedQty);
        const newTotal = newCount > 0 ? newCount * pRoll : newWeight * pKg;
        await client.query(
          `UPDATE inventory
           SET date=$1, company=$2, product=$3, weight_quantity=$4, count=$5,
               roll_price=$6, price_per_kg=$7, total=$8,
               scale_ticket_image=COALESCE($10, scale_ticket_image),
               updated_at=NOW()
           WHERE id=$9`,
          [date, company, product, newWeight, newCount, pRoll, pKg, newTotal, invId, scale_ticket_image || null]
        );
      }
    }

    await client.query('COMMIT');
    return sendSuccess(res, result.rows[0], 200, 'تم تحديث الفاتورة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/purchases/:id/price
 * Update ONLY price_per_ton and derived fields for a purchase + its linked inventory.
 */
const updatePurchasePrice = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const { price_per_ton } = req.body;

    if (!price_per_ton || Number(price_per_ton) <= 0) throw new Error('يرجى إدخال سعر طن صحيح');

    const purRes = await client.query(
      `SELECT * FROM purchases WHERE id=$1 AND branch_id=$2 FOR UPDATE`, [id, branch_id]
    );
    if (purRes.rows.length === 0) throw new Error('الفاتورة غير موجودة');

    const p = purRes.rows[0];
    const pTon = Number(price_per_ton);
    const pKg = pTon / 1000;
    const pRoll = Number(p.weight_quantity) > 0 && Number(p.count) > 0
      ? (Number(p.weight_quantity) / Number(p.count)) * pKg
      : 0;
    const newTotal = Number(p.count) > 0 ? Number(p.count) * pRoll : Number(p.weight_quantity) * pKg;
    const newTreasury = Math.max(0, newTotal - Number(p.credit_used));

    await client.query(
      `UPDATE purchases
       SET price_per_ton=$1, price_per_kg=$2, roll_price=$3, total=$4, treasury_balance=$5, updated_at=NOW()
       WHERE id=$6`,
      [pTon, pKg, pRoll, newTotal, newTreasury, id]
    );

    if (p.inventory_id && p.transferred_to_inventory) {
      await client.query(
        `UPDATE inventory SET price_per_kg=$1, roll_price=$2, total=count*$2, updated_at=NOW() WHERE id=$3`,
        [pKg, pRoll, p.inventory_id]
      );
    }

    await client.query(
      `UPDATE customer_balances SET invoice_amount=$1, notes='تعديل سعر فاتورة مشتريات'
       WHERE source_type='purchases' AND source_id=$2`,
      [newTotal, id]
    );

    await client.query('COMMIT');
    return sendSuccess(res, { price_per_ton: pTon, price_per_kg: pKg, roll_price: pRoll, new_total: newTotal }, 200, 'تم تحديث سعر الوزن بنجاح');
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

    const purRes = await client.query(
      `SELECT inventory_id, transferred_to_inventory FROM purchases WHERE id=$1 AND branch_id=$2 FOR UPDATE`, [id, branch_id]
    );
    if (purRes.rows.length === 0) throw new Error('المشتريات غير موجودة');

    const invId = purRes.rows[0].inventory_id;
    const wasTransferred = purRes.rows[0].transferred_to_inventory;

    if (invId && wasTransferred) {
      const invCheck = await client.query(
        `SELECT issued_quantity, issued_rolls FROM inventory WHERE id=$1`, [invId]
      );
      if (invCheck.rows.length > 0) {
        const issuedQty = Number(invCheck.rows[0].issued_quantity);
        const issuedRolls = Number(invCheck.rows[0].issued_rolls);
        if (issuedQty > 0 || issuedRolls > 0) {
          return sendError(res, 'لا يمكن حذف الفاتورة لأن كميات من هذا المخزن تم بيعها بالفعل', 400);
        }
      }
    }

    await client.query(
      `DELETE FROM customer_balances WHERE source_type='purchases' AND source_id=$1 AND branch_id=$2`,
      [id, branch_id]
    );
    await client.query(`DELETE FROM purchases WHERE id=$1 AND branch_id=$2`, [id, branch_id]);

    if (invId && wasTransferred) {
      await client.query(
        `DELETE FROM inventory WHERE id=$1 AND branch_id=$2
         AND COALESCE(issued_quantity,0)=0 AND COALESCE(issued_rolls,0)=0`,
        [invId, branch_id]
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, null, 200, 'تم حذف الفاتورة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message.includes('غير موجودة')) return sendError(res, err.message, 404);
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
    const branch_id = getEffectiveBranchId(req);
    const whereBranch = branch_id ? `WHERE branch_id=$1 AND` : `WHERE`;
    const params = branch_id ? [branch_id] : [];

    const productsRes = await pool.query(
      `SELECT DISTINCT product FROM purchases ${whereBranch} product IS NOT NULL AND product!='' ORDER BY product`,
      params
    );
    const companiesRes = await pool.query(
      `SELECT DISTINCT company FROM purchases ${whereBranch} company IS NOT NULL AND company!='' ORDER BY company`,
      params
    );
    return sendSuccess(res, {
      products: productsRes.rows.map(r => r.product),
      companies: companiesRes.rows.map(r => r.company),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPurchases, addPurchase, updatePurchase, updatePurchasePrice,
  deletePurchase, getUniqueValues, transferPurchaseToInventory,
};
