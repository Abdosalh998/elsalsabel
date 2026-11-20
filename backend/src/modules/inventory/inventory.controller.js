const pool = require('../../config/db');
const { sendSuccess, sendError, paginate, getEffectiveBranchId } = require('../../utils/helpers');

/**
 * GET /api/inventory
 * Returns inventory rows + totals summary + available weight per item
 */
const getInventory = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { product, company, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let baseWhere = `WHERE branch_id = $1`;
    const params = [branch_id];
    let paramIndex = 2;

    // Support multi-value (comma-separated) for product
    if (product) {
      const values = product.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        baseWhere += ` AND product ILIKE $${paramIndex}`;
        params.push(`%${values[0]}%`);
        paramIndex++;
      } else {
        baseWhere += ` AND product = ANY($${paramIndex}::text[])`;
        params.push(values);
        paramIndex++;
      }
    }

    // Support multi-value (comma-separated) for company
    if (company) {
      const values = company.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        baseWhere += ` AND company ILIKE $${paramIndex}`;
        params.push(`%${values[0]}%`);
        paramIndex++;
      } else {
        baseWhere += ` AND company = ANY($${paramIndex}::text[])`;
        params.push(values);
        paramIndex++;
      }
    }

    if (dateFrom && dateTo) {
      baseWhere += ` AND date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      baseWhere += ` AND date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      baseWhere += ` AND date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    // Main data query – include new Phase 1 columns
    const query = `
      SELECT 
        id, date, company, product,
        weight_quantity,
        count,
        roll_price,
        price_per_kg,
        image_url,
        scale_ticket_image,
        issued_quantity,
        issued_rolls,
        available_quantity,
        -- Remaining weight (weight-based)
        GREATEST(0, weight_quantity - issued_quantity) AS remaining_weight,
        -- Remaining rolls count
        GREATEST(0, COALESCE(count, 0) - COALESCE(issued_rolls, 0)) AS available_rolls,
        total,
        notes,
        section_id,
        (SELECT name FROM inventory_sections s WHERE s.id = inventory.section_id) AS section_name,
        (SELECT total_weight FROM inventory_sections s WHERE s.id = inventory.section_id) AS section_total_weight,
        (SELECT (total_weight - issued_weight) FROM inventory_sections s WHERE s.id = inventory.section_id) AS section_available_weight
      FROM inventory
      ${baseWhere}
      ORDER BY date DESC, id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Count query (same filters, no pagination)
    const countParams = params.slice(0, params.length - 2); // remove limit+offset
    const countQuery = `SELECT COUNT(*) FROM inventory ${baseWhere}`;
    const countResult = await pool.query(countQuery, countParams);

    // Summary / totals row (same filters, no pagination)
    const summaryQuery = `
      SELECT
        COALESCE(SUM(weight_quantity), 0)    AS total_weight_in,
        COALESCE(SUM(issued_quantity), 0)    AS total_issued,
        COALESCE(SUM(GREATEST(0, weight_quantity - issued_quantity)), 0) AS total_remaining_weight,
        COALESCE(SUM(count), 0)             AS total_rolls,
        COALESCE(SUM(GREATEST(0, COALESCE(count, 0) - COALESCE(issued_rolls, 0))), 0) AS total_remaining_rolls,
        COALESCE(SUM(total), 0)             AS total_value
      FROM inventory
      ${baseWhere}
    `;
    const summaryResult = await pool.query(summaryQuery, countParams);

    return sendSuccess(res, {
      inventory: result.rows,
      summary: summaryResult.rows[0],
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/inventory
 * Supports weight-only OR roll-based OR both tracking.
 * Merges into existing product entry if same product+company+branch.
 */
const addInventory = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const {
      date,
      company,
      product,
      weight_quantity = 0,
      count = 0,
      roll_price = 0,
      price_per_kg = 0,
      image_url = null,
      scale_ticket_image = null,
      notes = '',
      section_id = null
    } = req.body;

    if (!date || !product) return sendError(res, 'التاريخ واسم المنتج مطلوبان');

    const cleanProduct = String(product).trim();
    const cleanCompany = String(company || '').trim();
    const effectiveRollPrice = Number(roll_price) || 0;
    const effectivePricePerKg = Number(price_per_kg) || 0;
    const itemTotal = Number(count) > 0 ? (Number(count) * effectiveRollPrice) : (Number(weight_quantity) * effectivePricePerKg);
    const secId = section_id && !isNaN(Number(section_id)) ? Number(section_id) : null;

    // 1. Record immutable supply entry in inventory_supplies
    await pool.query(
      `INSERT INTO inventory_supplies 
       (branch_id, date, company, product, weight_quantity, count, price_per_kg, roll_price, total, scale_ticket_image, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [branch_id, date, cleanCompany, cleanProduct, Number(weight_quantity) || 0, Number(count) || 0, effectivePricePerKg, effectiveRollPrice, itemTotal, scale_ticket_image, notes]
    );

    // 2. Check if product already exists for this branch AND THIS COMPANY
    const existing = await pool.query(
      `SELECT id, count, weight_quantity, company, roll_price, price_per_kg FROM inventory 
       WHERE LOWER(TRIM(product)) = LOWER(TRIM($1)) 
         AND LOWER(TRIM(COALESCE(company, ''))) = LOWER(TRIM($2)) 
         AND branch_id = $3
       ORDER BY id DESC LIMIT 1`,
      [cleanProduct, cleanCompany, branch_id]
    );

    if (existing.rows.length > 0) {
      // Merge/accumulate into existing company row
      const current = existing.rows[0];
      const newCount = Number(current.count) + Number(count);
      const newWeight = Number(current.weight_quantity) + Number(weight_quantity);
      const effRollPrice = effectiveRollPrice || Number(current.roll_price) || 0;
      const effPricePerKg = effectivePricePerKg || Number(current.price_per_kg) || 0;
      const newTotal = newCount > 0 ? (newCount * effRollPrice) : (newWeight * effPricePerKg);

      const result = await pool.query(
        `UPDATE inventory 
         SET date = $1,
             weight_quantity = $2,
             count = $3,
             roll_price = $4,
             price_per_kg = $5,
             total = $6,
             notes = COALESCE(NULLIF($7, ''), notes),
             image_url = COALESCE(NULLIF($8, ''), image_url),
             scale_ticket_image = COALESCE(NULLIF($9, ''), scale_ticket_image),
             section_id = COALESCE($10, section_id),
             updated_at = NOW()
         WHERE id = $11 RETURNING *`,
        [date, newWeight, newCount, effRollPrice, effPricePerKg, newTotal, notes, image_url, scale_ticket_image, secId, current.id]
      );
      return sendSuccess(res, result.rows[0], 200, 'تم إضافة وتحديث كمية المنتج بالمخزن بنجاح');
    }

    // New product entry for this company
    const result = await pool.query(
      `INSERT INTO inventory 
       (branch_id, date, company, product, weight_quantity, count, roll_price, price_per_kg, total, notes, image_url, scale_ticket_image, section_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [branch_id, date, cleanCompany, cleanProduct, weight_quantity, count, effectiveRollPrice, effectivePricePerKg, itemTotal, notes, image_url, scale_ticket_image, secId]
    );

    return sendSuccess(res, result.rows[0], 201, 'تم إضافة المنتج للمخزن بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/inventory/:id
 */
const updateInventory = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;
    const {
      date, company, product,
      weight_quantity, count, roll_price,
      price_per_kg = 0, image_url = null,
      scale_ticket_image = null,
      notes,
      section_id
    } = req.body;

    // Fetch existing record
    const existing = await pool.query(
      `SELECT issued_quantity FROM inventory WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (existing.rows.length === 0) return sendError(res, 'المنتج غير موجود', 404);

    const issuedQty = Number(existing.rows[0].issued_quantity);
    const newCount = Number(count) || 0;

    // Validate count not less than already issued
    if (newCount < issuedQty) {
      return sendError(
        res,
        `لا يمكن تعديل عدد اللفات إلى ${newCount} لأن ${issuedQty} لفة تم بيعها بالفعل`,
        400
      );
    }

    const effectiveRollPrice = Number(roll_price) || 0;
    const effectivePricePerKg = Number(price_per_kg) || 0;
    const total = newCount * effectiveRollPrice;

    let updateSectionSql = '';
    const updateParams = [date, company, product, weight_quantity, count, effectiveRollPrice, effectivePricePerKg, total, notes, image_url, scale_ticket_image];
    let nextIdx = 12;
    if (section_id !== undefined) {
      const secVal = (section_id && !isNaN(Number(section_id))) ? Number(section_id) : null;
      updateSectionSql = `, section_id = $${nextIdx}`;
      updateParams.push(secVal);
      nextIdx++;
    }
    updateParams.push(id, branch_id);

    const result = await pool.query(
      `UPDATE inventory 
       SET date = COALESCE($1, date),
           company = $2,
           product = $3,
           weight_quantity = $4,
           count = $5,
           roll_price = $6,
           price_per_kg = $7,
           total = $8,
           notes = $9,
           image_url = COALESCE(NULLIF($10, ''), image_url),
           scale_ticket_image = COALESCE(NULLIF($11, ''), scale_ticket_image)
           ${updateSectionSql},
           updated_at = NOW()
       WHERE id = $${nextIdx} AND branch_id = $${nextIdx + 1} RETURNING *`,
      updateParams
    );

    return sendSuccess(res, result.rows[0], 200, 'تم تحديث بيانات المخزن بنجاح');
  } catch (err) {
    next(err);
  }
};


/**
 * DELETE /api/inventory/:id
 */
const deleteInventory = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const existing = await pool.query(`SELECT id, product, company FROM inventory WHERE id = $1 AND branch_id = $2`, [id, branch_id]);
    if (existing.rows.length === 0) return sendError(res, 'المنتج غير موجود', 404);

    // 1. Check if there are active sales referencing this inventory item
    const saleCheck = await pool.query(
      `SELECT 1 FROM sale_items WHERE inventory_id = $1 LIMIT 1`,
      [id]
    );
    if (saleCheck.rows.length > 0) {
      return sendError(res, 'لا يمكن حذف هذا المنتج لوجود فواتير مبيعات مسجلة عليه بالمخزن. يرجى حذف فواتير المبيعات أولاً', 400);
    }

    const legacySaleCheck = await pool.query(
      `SELECT 1 FROM sales WHERE inventory_id = $1 LIMIT 1`,
      [id]
    );
    if (legacySaleCheck.rows.length > 0) {
      return sendError(res, 'لا يمكن حذف هذا المنتج لوجود مبيعات مرتبطة به. يرجى حذف فواتير المبيعات أولاً', 400);
    }

    // 2. Check if there are active coloring orders referencing this inventory item
    const colCheck = await pool.query(
      `SELECT 1 FROM coloring_orders WHERE (inventory_id = $1 OR result_inventory_id = $1) LIMIT 1`,
      [id]
    );
    if (colCheck.rows.length > 0) {
      return sendError(res, 'لا يمكن حذف هذا المنتج لوجود أوامر تلوين مرتبطة به (كمادة خام أو كمنتج ملون مرحل). يرجى حذف أمر التلوين أولاً من صفحة التلوين', 400);
    }

    // 3. Check if there are transfer items
    const trfCheck = await pool.query(
      `SELECT 1 FROM transfer_items WHERE inventory_id = $1 LIMIT 1`,
      [id]
    );
    if (trfCheck.rows.length > 0) {
      return sendError(res, 'لا يمكن حذف هذا المنتج لوجود تحويلات بين الفروع مرتبطة به', 400);
    }

    // 4. Check if there are sales returns
    const retCheck = await pool.query(
      `SELECT 1 FROM returns WHERE inventory_id = $1 LIMIT 1`,
      [id]
    );
    if (retCheck.rows.length > 0) {
      return sendError(res, 'لا يمكن حذف هذا المنتج لوجود مرتجعات مبيعات مرتبطة به', 400);
    }

    // 5. Check if there are purchases
    const purCheck = await pool.query(
      `SELECT 1 FROM purchases WHERE inventory_id = $1 LIMIT 1`,
      [id]
    );
    if (purCheck.rows.length > 0) {
      return sendError(res, 'لا يمكن حذف هذا المنتج لوجود مشتريات مرتبطة به', 400);
    }

    await pool.query(
      `DELETE FROM inventory WHERE id = $1 AND branch_id = $2 RETURNING id`,
      [id, branch_id]
    );

    return sendSuccess(res, null, 200, 'تم حذف المنتج من المخزن بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/inventory/unique
 */
const getUniqueValues = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const whereBranch = branch_id ? `WHERE branch_id = $1 AND` : `WHERE`;
    const params = branch_id ? [branch_id] : [];

    const productsRes = await pool.query(
      `SELECT DISTINCT product FROM (
        SELECT product FROM inventory ${whereBranch} product IS NOT NULL AND product != ''
        UNION
        SELECT product FROM inventory_supplies ${whereBranch} product IS NOT NULL AND product != ''
      ) p ORDER BY product`,
      params
    );

    const companiesRes = await pool.query(
      `SELECT DISTINCT company FROM (
        SELECT company FROM inventory ${whereBranch} company IS NOT NULL AND company != ''
        UNION
        SELECT company FROM inventory_supplies ${whereBranch} company IS NOT NULL AND company != ''
      ) c ORDER BY company`,
      params
    );

    return sendSuccess(res, {
      products: productsRes.rows.map(r => r.product),
      companies: companiesRes.rows.map(r => r.company)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/inventory/supplies
 * Returns immutable supply/inbound log
 */
const getInventorySupplies = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { product, company, dateFrom, dateTo, search, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let baseWhere = `WHERE s.branch_id = $1`;
    const params = [branch_id];
    let paramIndex = 2;

    if (search) {
      baseWhere += ` AND (s.product ILIKE $${paramIndex} OR s.company ILIKE $${paramIndex} OR s.notes ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (product) {
      const values = product.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        baseWhere += ` AND s.product ILIKE $${paramIndex}`;
        params.push(`%${values[0]}%`);
        paramIndex++;
      } else {
        baseWhere += ` AND s.product = ANY($${paramIndex}::text[])`;
        params.push(values);
        paramIndex++;
      }
    }

    if (company) {
      const values = company.split(',').map(v => v.trim()).filter(Boolean);
      if (values.length === 1) {
        baseWhere += ` AND s.company ILIKE $${paramIndex}`;
        params.push(`%${values[0]}%`);
        paramIndex++;
      } else {
        baseWhere += ` AND s.company = ANY($${paramIndex}::text[])`;
        params.push(values);
        paramIndex++;
      }
    }

    if (dateFrom && dateTo) {
      baseWhere += ` AND s.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      baseWhere += ` AND s.date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      baseWhere += ` AND s.date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM inventory_supplies s ${baseWhere}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const sumRes = await pool.query(`
      SELECT 
        COUNT(s.id) AS total_records,
        COALESCE(SUM(s.weight_quantity), 0) AS total_weight,
        COALESCE(SUM(s.count), 0) AS total_rolls,
        COALESCE(SUM(s.total), 0) AS total_value
      FROM inventory_supplies s
      ${baseWhere}
    `, params);

    const dataParams = [...params, limit, offset];
    const dataRes = await pool.query(`
      SELECT 
        s.*,
        c.name AS supplier_name
      FROM inventory_supplies s
      LEFT JOIN customers c ON c.id = s.supplier_id
      ${baseWhere}
      ORDER BY s.date DESC, s.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, dataParams);

    return sendSuccess(res, {
      supplies: dataRes.rows,
      summary: sumRes.rows[0],
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/inventory/grouped
 * Returns products grouped with total available weight, total rolls, and companies
 */
const getGroupedInventory = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const whereBranch = branch_id ? `WHERE branch_id = $1` : ``;
    const params = branch_id ? [branch_id] : [];
    const result = await pool.query(`
      SELECT 
        TRIM(product) AS product,
        COALESCE(SUM(available_quantity), 0) AS total_available_weight,
        COALESCE(SUM(available_quantity), 0) AS available_quantity,
        COALESCE(SUM(GREATEST(0, count - COALESCE(issued_rolls, 0))), 0) AS total_available_rolls,
        COALESCE(SUM(GREATEST(0, count - COALESCE(issued_rolls, 0))), 0) AS available_rolls,
        COALESCE(SUM(weight_quantity), 0) AS total_weight_quantity,
        COALESCE(SUM(issued_quantity), 0) AS total_issued_quantity,
        COALESCE(AVG(NULLIF(price_per_kg, 0)), 0) AS avg_price_per_kg,
        COALESCE(AVG(NULLIF(roll_price, 0)), 0) AS avg_roll_price,
        MIN(id) AS sample_id,
        MIN(section_id) AS section_id,
        (SELECT name FROM inventory_sections s WHERE s.id = MIN(inventory.section_id)) AS section_name,
        json_agg(
          json_build_object(
            'id', id,
            'company', company,
            'weight_quantity', weight_quantity,
            'issued_quantity', issued_quantity,
            'available_quantity', available_quantity,
            'count', count,
            'issued_rolls', issued_rolls,
            'available_rolls', GREATEST(0, count - COALESCE(issued_rolls, 0)),
            'price_per_kg', price_per_kg,
            'roll_price', roll_price,
            'section_id', section_id,
            'section_name', (SELECT name FROM inventory_sections s WHERE s.id = inventory.section_id)
          ) ORDER BY date ASC, id ASC
        ) AS company_items
      FROM inventory
      ${whereBranch}
      GROUP BY TRIM(product)
      ORDER BY product ASC
    `, params);

    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getInventory,
  addInventory,
  updateInventory,
  deleteInventory,
  getUniqueValues,
  getInventorySupplies,
  getGroupedInventory
};
