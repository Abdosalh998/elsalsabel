const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * GET /api/coloring
 * Returns coloring orders with filters + summary
 */
const getColoringOrders = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { product, status, dateFrom, dateTo, search, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let baseWhere = `WHERE co.branch_id = $1`;
    const params = [branch_id];
    let paramIndex = 2;

    if (search) {
      baseWhere += ` AND (co.product ILIKE $${paramIndex} OR co.colored_product ILIKE $${paramIndex} OR co.order_number ILIKE $${paramIndex} OR co.color ILIKE $${paramIndex} OR co.coloring_company ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (product) {
      baseWhere += ` AND co.product ILIKE $${paramIndex}`;
      params.push(`%${product}%`);
      paramIndex++;
    }

    if (status) {
      baseWhere += ` AND co.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      baseWhere += ` AND co.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      baseWhere += ` AND co.date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      baseWhere += ` AND co.date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    // Summary query
    const summaryResult = await pool.query(
      `SELECT
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE co.status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE co.status = 'returned') AS returned_count,
        COUNT(*) FILTER (WHERE co.status = 'stocked') AS stocked_count,
        COALESCE(SUM(co.issued_weight), 0) AS total_issued_weight,
        COALESCE(SUM(co.issued_rolls), 0) AS total_issued_rolls,
        COALESCE(SUM(co.returned_weight), 0) AS total_returned_weight,
        COALESCE(SUM(co.returned_rolls), 0) AS total_returned_rolls,
        COALESCE(SUM(co.weight_gain), 0) AS total_weight_gain,
        COALESCE(SUM(co.coloring_cost), 0) AS total_coloring_cost
       FROM coloring_orders co ${baseWhere}`,
      params
    );

    // Total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM coloring_orders co ${baseWhere}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Order list with inventory info
    const dataParams = [...params, parseInt(limit, 10), offset];
    const dataResult = await pool.query(
      `SELECT
        co.*,
        inv.product AS raw_product_name,
        inv.company AS raw_company_name,
        inv.available_quantity AS raw_available_weight,
        inv.count AS raw_count,
        inv.issued_rolls AS raw_issued_rolls,
        pt.name AS payment_type_name
       FROM coloring_orders co
       LEFT JOIN inventory inv ON inv.id = co.inventory_id
       LEFT JOIN payment_types pt ON pt.id = co.payment_type_id
       ${baseWhere}
       ORDER BY co.date DESC, co.id DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      dataParams
    );

    return sendSuccess(res, {
      orders: dataResult.rows,
      summary: summaryResult.rows[0],
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Helper: Sync coloring expense with expenses table (deducts from treasury)
 */
async function _syncColoringExpense(db, branch_id, orderId) {
  try {
    const oRes = await db.query(
      `SELECT co.*, pt.name as payment_type_name, pt.channel as pt_channel
       FROM coloring_orders co
       LEFT JOIN payment_types pt ON pt.id = co.payment_type_id
       WHERE co.id = $1 AND co.branch_id = $2`,
      [orderId, branch_id]
    );
    if (!oRes.rows.length) return null;
    const order = oRes.rows[0];
    const cost = parseFloat(order.coloring_cost) || 0;
    const channel = order.channel || order.pt_channel || 'cash';
    const paymentTypeId = order.payment_type_id || null;
    const orderDate = order.date ? new Date(order.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const orderNum = order.order_number || `CLR-${order.id}`;
    const prodName = order.colored_product || order.product || 'ألومنيوم';
    const compName = (order.coloring_company && order.coloring_company.trim()) || '';
    const desc = `تكلفة تلوين أمر رقم ${orderNum} (${prodName})${compName ? ` لدى ${compName}` : ''}`;
    const recipient = compName || 'ورشة / مصنع التلوين';

    if (cost > 0) {
      if (order.expense_id) {
        const expCheck = await db.query(
          `SELECT id FROM expenses WHERE id = $1 AND branch_id = $2`,
          [order.expense_id, branch_id]
        );
        if (expCheck.rows.length > 0) {
          await db.query(
            `UPDATE expenses
             SET amount = $1,
                 date = $2,
                 description = $3,
                 channel = $4,
                 payment_type_id = $5,
                 notes = $6,
                 recipient_name = $7,
                 updated_at = NOW()
             WHERE id = $8`,
            [
              cost,
              orderDate,
              desc,
              channel,
              paymentTypeId,
              order.notes || `خصم تكلفة أمر التلوين #${orderNum}`,
              recipient,
              order.expense_id
            ]
          );
          return order.expense_id;
        }
      }

      // Insert new expense entry (deducts from treasury automatically)
      const expRes = await db.query(
        `INSERT INTO expenses (branch_id, date, description, amount, channel, payment_type_id, recipient_name, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          branch_id,
          orderDate,
          desc,
          cost,
          channel,
          paymentTypeId,
          recipient,
          order.notes || `خصم تكلفة أمر التلوين #${orderNum}`
        ]
      );
      const newExpenseId = expRes.rows[0].id;
      await db.query(
        `UPDATE coloring_orders SET expense_id = $1 WHERE id = $2`,
        [newExpenseId, orderId]
      );
      return newExpenseId;
    } else {
      if (order.expense_id) {
        await db.query(
          `DELETE FROM expenses WHERE id = $1 AND branch_id = $2`,
          [order.expense_id, branch_id]
        );
        await db.query(
          `UPDATE coloring_orders SET expense_id = NULL WHERE id = $1`,
          [orderId]
        );
      }
      return null;
    }
  } catch (err) {
    console.error('Error syncing coloring expense with treasury:', err);
    return null;
  }
}

/**
 * Helper: Stock a coloring order to inventory
 */
async function _stockOrderToInventory(client, branch_id, order, roll_price = 0, price_per_kg = 0, customNotes = '') {
  const finalProduct = (order.colored_product && order.colored_product.trim()) || `${order.product} ملون`;
  const finalWeight = parseFloat(order.returned_weight) > 0 ? parseFloat(order.returned_weight) : parseFloat(order.issued_weight);
  const finalRolls = parseInt(order.returned_rolls, 10) > 0 ? parseInt(order.returned_rolls, 10) : parseInt(order.issued_rolls, 10);
  const rPrice = parseFloat(roll_price) || 0;
  const kPrice = parseFloat(price_per_kg) || 0;

  // Search by product name in inventory for this branch
  const existingRes = await client.query(
    `SELECT * FROM inventory WHERE branch_id = $1 AND LOWER(TRIM(product)) = LOWER(TRIM($2)) LIMIT 1`,
    [branch_id, finalProduct]
  );

  let resultInventoryId;
  const noteText = customNotes || `مرحّل من أمر تلوين رقم ${order.order_number}`;

  if (existingRes.rows.length > 0) {
    const existing = existingRes.rows[0];
    const newWeight = parseFloat(existing.weight_quantity) + finalWeight;
    const newCount = (parseInt(existing.count, 10) || 0) + finalRolls;
    const effectiveRollPrice = rPrice > 0 ? rPrice : (parseFloat(existing.roll_price) || 0);
    const effectiveKgPrice = kPrice > 0 ? kPrice : (parseFloat(existing.price_per_kg) || 0);
    const newTotal = effectiveRollPrice > 0 ? (newCount * effectiveRollPrice) : (newWeight * effectiveKgPrice);

    await client.query(
      `UPDATE inventory
       SET weight_quantity = $1,
           count = $2,
           roll_price = $3,
           price_per_kg = $4,
           total = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [newWeight, newCount, effectiveRollPrice, effectiveKgPrice, newTotal, existing.id]
    );
    resultInventoryId = existing.id;
  } else {
    const totalVal = rPrice > 0 ? (finalRolls * rPrice) : (finalWeight * kPrice);
    const insRes = await client.query(
      `INSERT INTO inventory
        (branch_id, date, product, company, weight_quantity, count,
         roll_price, price_per_kg, issued_quantity, issued_rolls, total, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, $9, $10)
       RETURNING id`,
      [
        branch_id,
        new Date().toISOString().split('T')[0],
        finalProduct,
        'تلوين',
        finalWeight,
        finalRolls,
        rPrice,
        kPrice,
        totalVal,
        noteText,
      ]
    );
    resultInventoryId = insRes.rows[0].id;
  }

  // Update order status to stocked
  const updatedOrderRes = await client.query(
    `UPDATE coloring_orders
     SET status = 'stocked',
         colored_product = $1,
         result_inventory_id = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [finalProduct, resultInventoryId, order.id]
  );

  return updatedOrderRes.rows[0];
}

/**
 * POST /api/coloring
 * Create new coloring order — deducts from inventory
 * Supports auto_stock flag if product is already received
 */
const addColoringOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const {
      date,
      order_number,
      inventory_id,
      issued_weight,
      issued_rolls,
      returned_weight,
      returned_rolls,
      weight_gain,
      color,
      colored_product,
      coloring_company,
      coloring_cost,
      payment_type_id,
      channel,
      notes,
      image_url,
      scale_ticket_image,
      auto_stock,
      roll_price,
      price_per_kg,
    } = req.body;

    if (!inventory_id) {
      return sendError(res, 'يجب اختيار الصنف المنصرف من المخزن', 400);
    }

    const issuedW = parseFloat(issued_weight) || 0;
    const issuedR = parseInt(issued_rolls, 10) || 0;

    if (issuedW <= 0 && issuedR <= 0) {
      return sendError(res, 'يجب إدخال كمية منصرفة (وزن أو عدد لفات)', 400);
    }

    // Verify inventory item
    const invRes = await client.query(
      `SELECT * FROM inventory WHERE id = $1 AND branch_id = $2`,
      [inventory_id, branch_id]
    );
    if (!invRes.rows.length) {
      return sendError(res, 'الصنف غير موجود في المخزن', 404);
    }
    const inv = invRes.rows[0];
    const productName = inv.product;

    // Check total available weight for this product across all companies in this branch
    const totalAvailRes = await client.query(
      `SELECT COALESCE(SUM(available_quantity), 0) AS total_avail,
              COALESCE(SUM(GREATEST(0, count - COALESCE(issued_rolls, 0))), 0) AS total_rolls
       FROM inventory
       WHERE branch_id = $1 AND LOWER(TRIM(product)) = LOWER(TRIM($2))`,
      [branch_id, productName]
    );
    const totalAvailableW = Number(totalAvailRes.rows[0].total_avail);

    if (issuedW > totalAvailableW) {
      return sendError(res, `الوزن المنصرف للتلوين (${issuedW} كجم) أكبر من المتاح بالمخزن لهذا الصنف (${totalAvailableW.toFixed(2)} كجم)`, 400);
    }

    // Deduct immediately using FIFO across company rows of this product
    let remainingW = issuedW;
    let remainingR = issuedR;
    const fifoRows = await client.query(
      `SELECT id, available_quantity, GREATEST(0, count - COALESCE(issued_rolls, 0)) AS avail_rolls
       FROM inventory
       WHERE branch_id = $1 AND LOWER(TRIM(product)) = LOWER(TRIM($2)) AND (weight_quantity - issued_quantity) > 0
       ORDER BY date ASC, id ASC
       FOR UPDATE`,
      [branch_id, productName]
    );

    if (fifoRows.rows.length === 0) {
      await client.query(
        `UPDATE inventory
         SET issued_quantity = COALESCE(issued_quantity, 0) + $1,
             issued_rolls = COALESCE(issued_rolls, 0) + $2,
             updated_at = NOW()
         WHERE id = $3`,
        [issuedW, issuedR, inventory_id]
      );
    } else {
      for (const fRow of fifoRows.rows) {
        if (remainingW <= 0) break;
        const availW = Number(fRow.available_quantity);
        const availR = Number(fRow.avail_rolls);

        const deductW = Math.min(availW, remainingW);
        const deductR = remainingR > 0 ? Math.min(availR, remainingR) : 0;

        await client.query(
          `UPDATE inventory
           SET issued_quantity = COALESCE(issued_quantity, 0) + $1,
               issued_rolls = COALESCE(issued_rolls, 0) + $2,
               updated_at = NOW()
           WHERE id = $3`,
          [deductW, deductR, fRow.id]
        );

        remainingW -= deductW;
        remainingR -= deductR;
      }

      if (remainingW > 0 && fifoRows.rows.length > 0) {
        const lastId = fifoRows.rows[fifoRows.rows.length - 1].id;
        await client.query(
          `UPDATE inventory
           SET issued_quantity = COALESCE(issued_quantity, 0) + $1,
               issued_rolls = COALESCE(issued_rolls, 0) + $2,
               updated_at = NOW()
           WHERE id = $3`,
          [remainingW, remainingR, lastId]
        );
      }
    }

    // Auto-generate order number if empty
    let finalOrderNum = order_number;
    if (!finalOrderNum) {
      const cntRes = await client.query(
        `SELECT COUNT(*) FROM coloring_orders WHERE branch_id = $1`,
        [branch_id]
      );
      finalOrderNum = `CLR-${String(parseInt(cntRes.rows[0].count, 10) + 1).padStart(4, '0')}`;
    }

    const defaultColoredName = (colored_product && colored_product.trim()) || `${inv.product} ملون`;

    // Calculate returned weight / gain if provided
    let retW = parseFloat(returned_weight) || 0;
    let gainW = parseFloat(weight_gain) || 0;
    let retR = parseInt(returned_rolls, 10) || 0;

    if (auto_stock || retW > 0 || gainW !== 0) {
      if (retW > 0 && gainW === 0) {
        gainW = retW - issuedW;
      } else if (gainW !== 0 && retW === 0) {
        retW = issuedW + gainW;
      } else if (retW === 0 && gainW === 0) {
        retW = issuedW;
      }
      if (retR === 0) retR = issuedR;
    }

    let finalChannel = channel || 'cash';
    if (payment_type_id) {
      const ptRes = await client.query('SELECT channel FROM payment_types WHERE id = $1', [payment_type_id]);
      if (ptRes.rows.length && ptRes.rows[0].channel) {
        finalChannel = ptRes.rows[0].channel;
      }
    }

    const insertRes = await client.query(
      `INSERT INTO coloring_orders
        (branch_id, date, order_number, product, inventory_id,
         issued_weight, issued_rolls, returned_weight, returned_rolls, weight_gain,
         color, colored_product, coloring_company, coloring_cost, status, notes, image_url, scale_ticket_image,
         payment_type_id, channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        branch_id,
        date || new Date().toISOString().split('T')[0],
        finalOrderNum,
        inv.product,
        inventory_id,
        issuedW,
        issuedR,
        retW,
        retR,
        gainW,
        color || '',
        defaultColoredName,
        (coloring_company && coloring_company.trim()) || '',
        parseFloat(coloring_cost) || 0,
        auto_stock ? 'returned' : (retW > 0 ? 'returned' : 'pending'),
        notes || '',
        image_url || null,
        scale_ticket_image || null,
        payment_type_id ? parseInt(payment_type_id, 10) : null,
        finalChannel,
      ]
    );

    let createdOrder = insertRes.rows[0];

    // Deduct coloring cost from treasury by syncing with expenses table
    if (parseFloat(coloring_cost) > 0) {
      await _syncColoringExpense(client, branch_id, createdOrder.id);
    }

    // If auto_stock requested, stock immediately into inventory
    if (auto_stock) {
      createdOrder = await _stockOrderToInventory(
        client,
        branch_id,
        createdOrder,
        roll_price,
        price_per_kg,
        notes
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, createdOrder, 201, 'تم إضافة أمر التلوين بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/coloring/:id/return
 * Record return from coloring (goods received back)
 */
const returnFromColoring = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const {
      returned_weight,
      returned_rolls,
      weight_gain,
      coloring_cost,
      coloring_company,
      payment_type_id,
      channel,
      notes,
      auto_stock,
      roll_price,
      price_per_kg,
      colored_product,
    } = req.body;

    const orderRes = await client.query(
      `SELECT * FROM coloring_orders WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (!orderRes.rows.length) {
      return sendError(res, 'أمر التلوين غير موجود', 404);
    }
    const order = orderRes.rows[0];
    if (order.status === 'stocked') {
      return sendError(res, 'هذا الأمر تم ترحيله للمخزن بالفعل', 400);
    }

    const issuedW = parseFloat(order.issued_weight) || 0;
    let retW = parseFloat(returned_weight) || 0;
    let gainW = parseFloat(weight_gain) || 0;
    let retR = parseInt(returned_rolls, 10);

    if (isNaN(retR)) {
      retR = parseInt(order.issued_rolls, 10) || 0;
    }

    if (retW > 0 && (weight_gain === undefined || weight_gain === null || weight_gain === '')) {
      gainW = retW - issuedW;
    } else if (gainW !== 0 && (!retW || retW === 0)) {
      retW = issuedW + gainW;
    } else if (retW === 0 && gainW === 0) {
      retW = issuedW;
      gainW = 0;
    }

    const parsedCost =
      coloring_cost !== undefined && coloring_cost !== null && coloring_cost !== ''
        ? parseFloat(coloring_cost)
        : null;

    let finalChannel = channel;
    if (payment_type_id) {
      const ptRes = await client.query('SELECT channel FROM payment_types WHERE id = $1', [payment_type_id]);
      if (ptRes.rows.length && ptRes.rows[0].channel) {
        finalChannel = ptRes.rows[0].channel;
      }
    }

    const updateRes = await client.query(
      `UPDATE coloring_orders
       SET returned_weight = $1,
           returned_rolls = $2,
           weight_gain = $3,
           status = 'returned',
           colored_product = COALESCE(NULLIF($4, ''), colored_product),
           coloring_cost = CASE WHEN $5::numeric IS NOT NULL THEN $5::numeric ELSE coloring_cost END,
           payment_type_id = CASE WHEN $6::int IS NOT NULL THEN $6::int ELSE payment_type_id END,
           channel = COALESCE(NULLIF($7, ''), channel),
           coloring_company = COALESCE(NULLIF($8, ''), coloring_company),
           notes = CASE WHEN $9 != '' THEN $9 ELSE notes END,
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        retW,
        retR,
        gainW,
        colored_product || null,
        parsedCost,
        payment_type_id ? parseInt(payment_type_id, 10) : null,
        finalChannel || null,
        coloring_company ? coloring_company.trim() : null,
        notes || '',
        id,
      ]
    );

    let updatedOrder = updateRes.rows[0];

    // Sync expense to deduct from treasury
    await _syncColoringExpense(client, branch_id, id);

    // If auto_stock is selected, stock to inventory now
    if (auto_stock) {
      updatedOrder = await _stockOrderToInventory(
        client,
        branch_id,
        updatedOrder,
        roll_price,
        price_per_kg,
        notes
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, updatedOrder, 200, 'تم تسجيل عودة البضاعة من التلوين بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/coloring/:id/stock
 * Transfer returned colored product to inventory
 */
const stockColoredProduct = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;
    const { roll_price, price_per_kg, notes, colored_product, coloring_cost } = req.body;

    const orderRes = await client.query(
      `SELECT * FROM coloring_orders WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (!orderRes.rows.length) {
      return sendError(res, 'أمر التلوين غير موجود', 404);
    }
    const order = orderRes.rows[0];

    if (order.status === 'stocked') {
      return sendError(res, 'تم ترحيل هذا الأمر للمخزن بالفعل', 400);
    }

    if (order.status === 'pending') {
      return sendError(res, 'يجب تسجيل عودة البضاعة من التلوين أولاً قبل الترحيل', 400);
    }

    if (colored_product && colored_product.trim()) {
      order.colored_product = colored_product.trim();
    }

    if (coloring_cost !== undefined && coloring_cost !== null && coloring_cost !== '') {
      const parsedCost = parseFloat(coloring_cost) || 0;
      await client.query(
        `UPDATE coloring_orders SET coloring_cost = $1 WHERE id = $2`,
        [parsedCost, id]
      );
      order.coloring_cost = parsedCost;
      await _syncColoringExpense(client, branch_id, id);
    }

    const stockedOrder = await _stockOrderToInventory(
      client,
      branch_id,
      order,
      roll_price,
      price_per_kg,
      notes
    );

    await client.query('COMMIT');
    return sendSuccess(res, stockedOrder, 200, 'تم ترحيل البضاعة الملونة للمخزن بنجاح وتوفيرها للبيع');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/coloring/:id
 * Update coloring order info
 */
const updateColoringOrder = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;
    const {
      date,
      order_number,
      color,
      colored_product,
      coloring_company,
      coloring_cost,
      payment_type_id,
      channel,
      notes,
      image_url,
      scale_ticket_image,
    } = req.body;

    const orderRes = await pool.query(
      `SELECT * FROM coloring_orders WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (!orderRes.rows.length) {
      return sendError(res, 'أمر التلوين غير موجود', 404);
    }

    const parsedCost =
      coloring_cost !== undefined && coloring_cost !== null && coloring_cost !== ''
        ? parseFloat(coloring_cost)
        : null;

    let finalChannel = channel;
    if (payment_type_id) {
      const ptRes = await pool.query('SELECT channel FROM payment_types WHERE id = $1', [payment_type_id]);
      if (ptRes.rows.length && ptRes.rows[0].channel) {
        finalChannel = ptRes.rows[0].channel;
      }
    }

    const result = await pool.query(
      `UPDATE coloring_orders
       SET date = COALESCE($1, date),
           order_number = COALESCE($2, order_number),
           color = COALESCE($3, color),
           colored_product = COALESCE($4, colored_product),
           coloring_company = COALESCE($5, coloring_company),
           coloring_cost = CASE WHEN $6::numeric IS NOT NULL THEN $6::numeric ELSE coloring_cost END,
           payment_type_id = CASE WHEN $7::int IS NOT NULL THEN $7::int ELSE payment_type_id END,
           channel = COALESCE(NULLIF($8, ''), channel),
           notes = COALESCE($9, notes),
           image_url = COALESCE($10, image_url),
           scale_ticket_image = COALESCE($11, scale_ticket_image),
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        date,
        order_number,
        color,
        colored_product,
        coloring_company !== undefined ? coloring_company : null,
        parsedCost,
        payment_type_id !== undefined ? (payment_type_id ? parseInt(payment_type_id, 10) : null) : null,
        finalChannel || null,
        notes,
        image_url,
        scale_ticket_image,
        id,
      ]
    );

    await _syncColoringExpense(pool, branch_id, id);

    return sendSuccess(res, result.rows[0], 200, 'تم تحديث أمر التلوين وتكلفة الخزينة بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/coloring/:id
 * Delete coloring order — reverses inventory issue and deletes stocked product/expenses
 */
const deleteColoringOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;

    const orderRes = await client.query(
      `SELECT * FROM coloring_orders WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (!orderRes.rows.length) {
      return sendError(res, 'أمر التلوين غير موجود', 404);
    }
    const order = orderRes.rows[0];

    // If order was stocked into inventory, reverse/delete the resulting inventory item
    if (order.status === 'stocked' && order.result_inventory_id) {
      // Check if the resulting colored product has sales
      const saleCheck = await client.query(
        `SELECT 1 FROM sale_items WHERE inventory_id = $1 LIMIT 1`,
        [order.result_inventory_id]
      );
      if (saleCheck.rows.length > 0) {
        return sendError(
          res,
          'لا يمكن حذف أمر التلوين لأن المنتج الملون الناتج تم بيع كميات منه بالفعل بالمخزن. يرجى حذف فواتير المبيعات أولاً',
          400
        );
      }

      const resInvRes = await client.query(
        `SELECT * FROM inventory WHERE id = $1 AND branch_id = $2`,
        [order.result_inventory_id, branch_id]
      );
      if (resInvRes.rows.length > 0) {
        const resInv = resInvRes.rows[0];
        const retWeight = parseFloat(order.returned_weight) > 0 ? parseFloat(order.returned_weight) : (parseFloat(order.issued_weight) || 0);
        const retRolls = parseInt(order.returned_rolls, 10) > 0 ? parseInt(order.returned_rolls, 10) : (parseInt(order.issued_rolls, 10) || 0);

        const remainingWeight = Math.max(0, parseFloat(resInv.weight_quantity || 0) - retWeight);
        const remainingRolls = Math.max(0, parseInt(resInv.count || 0, 10) - retRolls);

        // Disconnect result_inventory_id first to prevent FK constraint error
        await client.query(`UPDATE coloring_orders SET result_inventory_id = NULL WHERE id = $1`, [id]);

        if (remainingWeight <= 0 && remainingRolls <= 0) {
          await client.query(`DELETE FROM inventory WHERE id = $1 AND branch_id = $2`, [order.result_inventory_id, branch_id]);
        } else {
          const effRollPrice = parseFloat(resInv.roll_price) || 0;
          const effKgPrice = parseFloat(resInv.price_per_kg) || 0;
          const newTotal = effRollPrice > 0 ? (remainingRolls * effRollPrice) : (remainingWeight * effKgPrice);
          await client.query(
            `UPDATE inventory
             SET weight_quantity = $1, count = $2, total = $3, updated_at = NOW()
             WHERE id = $4`,
            [remainingWeight, remainingRolls, newTotal, order.result_inventory_id]
          );
        }
      }
    }

    // Restore issued stock on raw inventory item
    if (order.inventory_id) {
      const issuedW = parseFloat(order.issued_weight) || 0;
      const issuedR = parseInt(order.issued_rolls, 10) || 0;
      await client.query(
        `UPDATE inventory
         SET issued_quantity = GREATEST(COALESCE(issued_quantity, 0) - $1, 0),
             issued_rolls = GREATEST(COALESCE(issued_rolls, 0) - $2, 0),
             issued_to_coloring = GREATEST(COALESCE(issued_to_coloring, 0) - $1, 0),
             issued_rolls_coloring = GREATEST(COALESCE(issued_rolls_coloring, 0) - $2, 0),
             updated_at = NOW()
         WHERE id = $3`,
        [issuedW, issuedR, order.inventory_id]
      );
    }

    // If an expense was linked for coloring cost, delete it
    if (order.expense_id) {
      const expId = order.expense_id;
      await client.query(`UPDATE coloring_orders SET expense_id = NULL WHERE id = $1`, [id]);
      await client.query(`DELETE FROM expenses WHERE id = $1 AND branch_id = $2`, [expId, branch_id]);
    }

    await client.query(`DELETE FROM coloring_orders WHERE id = $1`, [id]);
    await client.query('COMMIT');
    return sendSuccess(res, null, 200, 'تم حذف أمر التلوين واسترجاع الرصيد للمخزن بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/coloring/inventory-items
 * Returns available products in inventory to choose from for coloring
 */
const getInventoryForColoring = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const result = await pool.query(
      `SELECT 
         MIN(id) AS id,
         TRIM(product) AS product,
         STRING_AGG(DISTINCT company, '، ') AS company,
         COALESCE(SUM(weight_quantity - issued_quantity), 0) AS available_quantity,
         COALESCE(SUM(GREATEST(count - COALESCE(issued_rolls, 0), 0)), 0) AS available_rolls,
         COALESCE(AVG(NULLIF(roll_price, 0)), 0) AS roll_price,
         COALESCE(AVG(NULLIF(price_per_kg, 0)), 0) AS price_per_kg
       FROM inventory
       WHERE branch_id = $1
         AND (weight_quantity - issued_quantity) > 0
       GROUP BY TRIM(product)
       ORDER BY product ASC`,
      [branch_id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getColoringOrders,
  addColoringOrder,
  returnFromColoring,
  stockColoredProduct,
  updateColoringOrder,
  deleteColoringOrder,
  getInventoryForColoring,
};
