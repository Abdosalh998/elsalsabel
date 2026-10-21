const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * GET /api/inventory
 */
const getInventory = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { product, company, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = `
      SELECT id, date, company, product, weight_quantity, count, roll_price, 
             issued_quantity, available_quantity, total, notes
      FROM inventory
      WHERE branch_id = $1
    `;
    const params = [branch_id];
    let paramIndex = 2;

    if (product) {
      query += ` AND product ILIKE $${paramIndex}`;
      params.push(`%${product}%`);
      paramIndex++;
    }

    if (company) {
      query += ` AND company ILIKE $${paramIndex}`;
      params.push(`%${company}%`);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      query += ` AND date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      query += ` AND date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ` ORDER BY date DESC, id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    // Count query
    let countQuery = `SELECT COUNT(*) FROM inventory WHERE branch_id = $1`;
    const countParams = [branch_id];
    let countIndex = 2;

    if (product) {
      countQuery += ` AND product ILIKE $${countIndex}`;
      countParams.push(`%${product}%`);
      countIndex++;
    }

    if (company) {
      countQuery += ` AND company ILIKE $${countIndex}`;
      countParams.push(`%${company}%`);
      countIndex++;
    }

    if (dateFrom && dateTo) {
      countQuery += ` AND date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      countParams.push(dateFrom, dateTo);
      countIndex += 2;
    } else if (dateFrom) {
      countQuery += ` AND date >= $${countIndex}`;
      countParams.push(dateFrom);
      countIndex++;
    } else if (dateTo) {
      countQuery += ` AND date <= $${countIndex}`;
      countParams.push(dateTo);
      countIndex++;
    }

    const countResult = await pool.query(countQuery, countParams);

    return sendSuccess(res, {
      inventory: result.rows,
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
 */
const addInventory = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { date, company, product, weight_quantity = 0, count = 0, roll_price = 0, notes = '' } = req.body;

    if (!date || !product) return sendError(res, 'التاريخ واسم المنتج مطلوبان');

    // Check if product already exists
    const existing = await pool.query(
      `SELECT id, count, weight_quantity FROM inventory 
       WHERE product = $1 AND COALESCE(company, '') = COALESCE($2, '') AND branch_id = $3
       ORDER BY id DESC LIMIT 1`,
      [product, company || '', branch_id]
    );

    if (existing.rows.length > 0) {
      // UPDATE existing row
      const current = existing.rows[0];
      const newCount = Number(current.count) + Number(count);
      const newWeight = Number(current.weight_quantity) + Number(weight_quantity);
      const newTotal = newCount * Number(roll_price);

      const result = await pool.query(
        `UPDATE inventory 
         SET date = $1,
             weight_quantity = $2,
             count = $3,
             roll_price = $4,
             total = $5,
             notes = COALESCE(NULLIF($6, ''), notes),
             updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [date, newWeight, newCount, roll_price, newTotal, notes, current.id]
      );
      return sendSuccess(res, result.rows[0], 200, 'تم دمج وتحديث مخزون المنتج بنجاح');
    }

    // الإجمالي = عدد اللفات × سعر اللفة
    const total = Number(count) * Number(roll_price);

    const result = await pool.query(
      `INSERT INTO inventory 
       (branch_id, date, company, product, weight_quantity, count, roll_price, total, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [branch_id, date, company, product, weight_quantity, count, roll_price, total, notes]
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
    const { date, company, product, weight_quantity, count, roll_price, notes } = req.body;

    // Fetch existing record
    const existing = await pool.query(
      `SELECT issued_quantity FROM inventory WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (existing.rows.length === 0) return sendError(res, 'المنتج غير موجود', 404);
    
    const issuedQty = Number(existing.rows[0].issued_quantity);
    const newCount = Number(count);

    // Validate that new count (rolls) is not less than already issued
    if (newCount < issuedQty) {
      return sendError(
        res,
        `لا يمكن تعديل عدد اللفات إلى ${newCount} لأن ${issuedQty} لفة تم بيعها بالفعل`,
        400
      );
    }

    // الإجمالي = عدد اللفات × سعر اللفة
    const total = newCount * Number(roll_price);
    const availableQty = newCount - issuedQty;

    const result = await pool.query(
      `UPDATE inventory 
       SET date = COALESCE($1, date),
           company = $2,
           product = $3,
           weight_quantity = $4,
           count = $5,
           roll_price = $6,
           total = $7,
           notes = $8,
           updated_at = NOW()
       WHERE id = $9 AND branch_id = $10 RETURNING *`,
      [date, company, product, weight_quantity, count, roll_price, total, notes, id, branch_id]
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

    const existing = await pool.query(`SELECT issued_quantity FROM inventory WHERE id = $1 AND branch_id = $2`, [id, branch_id]);
    if (existing.rows.length === 0) return sendError(res, 'المنتج غير موجود', 404);
    
    if (existing.rows[0].issued_quantity > 0) {
      return sendError(res, 'لا يمكن حذف منتج تم بيع كميات منه', 400);
    }

    const result = await pool.query(
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
    const { branch_id } = req.user;
    
    const productsRes = await pool.query(
      `SELECT DISTINCT product FROM inventory WHERE branch_id = $1 AND product IS NOT NULL ORDER BY product`,
      [branch_id]
    );
    
    const companiesRes = await pool.query(
      `SELECT DISTINCT company FROM inventory WHERE branch_id = $1 AND company IS NOT NULL AND company != '' ORDER BY company`,
      [branch_id]
    );

    return sendSuccess(res, {
      products: productsRes.rows.map(r => r.product),
      companies: companiesRes.rows.map(r => r.company)
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getInventory, addInventory, updateInventory, deleteInventory, getUniqueValues };
