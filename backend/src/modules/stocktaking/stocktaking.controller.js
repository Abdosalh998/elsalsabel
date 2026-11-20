const pool = require('../../config/db');
const { sendSuccess, sendError, paginate, getEffectiveBranchId } = require('../../utils/helpers');

// Helper to generate stocktake number e.g. JRD-202611-0001
const generateStocktakeNumber = async (client, branch_id) => {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `JRD-${yearMonth}-`;

  const countRes = await client.query(
    `SELECT COUNT(*) FROM stocktakes WHERE branch_id = $1 AND stocktake_number LIKE $2`,
    [branch_id, `${prefix}%`]
  );
  const nextNum = Number(countRes.rows[0].count) + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
};

// ─── GET all stocktakes for branch ──────────────────────────────────────────
const getStocktakes = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { page = 1, limit = 20, status, type, startDate, endDate, search } = req.query;
    const { limit: l, offset } = paginate(page, limit);

    let where = `WHERE s.branch_id = $1`;
    const params = [branch_id];
    let pIdx = 2;

    if (status && status !== 'all') {
      where += ` AND s.status = $${pIdx++}`;
      params.push(status);
    }

    if (type && type !== 'all') {
      where += ` AND s.type = $${pIdx++}`;
      params.push(type);
    }

    if (startDate) {
      where += ` AND s.date >= $${pIdx++}`;
      params.push(startDate);
    }

    if (endDate) {
      where += ` AND s.date <= $${pIdx++}`;
      params.push(endDate);
    }

    if (search && search.trim()) {
      where += ` AND (s.stocktake_number ILIKE $${pIdx} OR s.title ILIKE $${pIdx} OR s.auditor_name ILIKE $${pIdx} OR s.notes ILIKE $${pIdx})`;
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    // Summary query
    const summaryRes = await pool.query(`
      SELECT
        COUNT(*) AS total_stocktakes,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) AS draft_count,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) AS in_progress_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_count,
        COUNT(CASE WHEN status = 'settled' THEN 1 END) AS settled_count,
        COALESCE(SUM(total_weight_diff), 0) AS net_weight_diff,
        COALESCE(SUM(total_financial_diff), 0) AS net_financial_diff
      FROM stocktakes s
      ${where}
    `, params);

    // List query
    const listQuery = `
      SELECT
        s.*,
        sec.name AS section_name,
        u.username AS settled_by_username,
        (SELECT COUNT(*) FROM stocktake_items si WHERE si.stocktake_id = s.id) AS total_items,
        (SELECT COUNT(*) FROM stocktake_items si WHERE si.stocktake_id = s.id AND si.actual_weight IS NOT NULL) AS items_counted,
        (SELECT COUNT(*) FROM stocktake_items si WHERE si.stocktake_id = s.id AND (si.weight_diff < 0 OR si.rolls_diff < 0)) AS shortage_items_count,
        (SELECT COUNT(*) FROM stocktake_items si WHERE si.stocktake_id = s.id AND (si.weight_diff > 0 OR si.rolls_diff > 0)) AS surplus_items_count
      FROM stocktakes s
      LEFT JOIN inventory_sections sec ON sec.id = s.section_id
      LEFT JOIN users u ON u.id = s.settled_by
      ${where}
      ORDER BY s.date DESC, s.id DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;

    const listRes = await pool.query(listQuery, [...params, l, offset]);

    return sendSuccess(res, {
      stocktakes: listRes.rows,
      summary: summaryRes.rows[0],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(summaryRes.rows[0].total_stocktakes || 0),
        totalPages: Math.ceil(Number(summaryRes.rows[0].total_stocktakes || 0) / Number(limit))
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET single stocktake with items ────────────────────────────────────────
const getStocktakeById = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    const secRes = await pool.query(`
      SELECT
        s.*,
        sec.name AS section_name,
        u.username AS settled_by_username
      FROM stocktakes s
      LEFT JOIN inventory_sections sec ON sec.id = s.section_id
      LEFT JOIN users u ON u.id = s.settled_by
      WHERE s.id = $1 AND s.branch_id = $2
    `, [id, branch_id]);

    if (secRes.rows.length === 0) {
      return sendError(res, 'جلسة الجرد غير موجودة', 404);
    }

    const itemsRes = await pool.query(`
      SELECT
        si.*,
        sec.name AS section_name,
        inv.available_quantity AS current_available_weight,
        GREATEST(0, COALESCE(inv.count, 0) - COALESCE(inv.issued_rolls, 0)) AS current_available_rolls
      FROM stocktake_items si
      LEFT JOIN inventory_sections sec ON sec.id = si.section_id
      LEFT JOIN inventory inv ON inv.id = si.inventory_id
      WHERE si.stocktake_id = $1 AND si.branch_id = $2
      ORDER BY si.product ASC, si.id ASC
    `, [id, branch_id]);

    return sendSuccess(res, {
      ...secRes.rows[0],
      items: itemsRes.rows
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST create new stocktake session ──────────────────────────────────────
const createStocktake = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const branch_id = getEffectiveBranchId(req);
    const {
      title,
      date = new Date().toISOString().slice(0, 10),
      type = 'full', // 'full' | 'section'
      section_id = null,
      auditor_name = '',
      notes = ''
    } = req.body;

    if (!title || !title.trim()) {
      await client.query('ROLLBACK');
      return sendError(res, 'عنوان أو مسمى جلسة الجرد مطلوب');
    }

    const secId = (type === 'section' && section_id) ? Number(section_id) : null;
    const stocktakeNumber = await generateStocktakeNumber(client, branch_id);

    // Fetch snapshot of inventory items to be counted
    let invWhere = `WHERE branch_id = $1`;
    const invParams = [branch_id];

    if (secId) {
      invWhere += ` AND section_id = $2`;
      invParams.push(secId);
    }

    const invQuery = `
      SELECT
        id,
        product,
        company,
        section_id,
        available_quantity,
        count,
        issued_rolls,
        GREATEST(0, COALESCE(count, 0) - COALESCE(issued_rolls, 0)) AS available_rolls,
        COALESCE(price_per_kg, roll_price, 0) AS unit_price
      FROM inventory
      ${invWhere}
      ORDER BY product ASC, id ASC
    `;

    const invRes = await client.query(invQuery, invParams);

    // Calculate initial system totals
    let totalSysWeight = 0;
    let totalSysRolls = 0;
    invRes.rows.forEach(r => {
      totalSysWeight += Number(r.available_quantity || 0);
      totalSysRolls += Number(r.available_rolls || 0);
    });

    // Insert stocktakes session header
    const insertHeaderRes = await client.query(`
      INSERT INTO stocktakes (
        branch_id, stocktake_number, date, title, type, section_id,
        status, auditor_name, notes, total_items_counted,
        total_system_weight, total_actual_weight, total_weight_diff,
        total_rolls_diff, total_financial_diff
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        'draft', $7, $8, 0,
        $9, 0, 0,
        0, 0
      ) RETURNING *
    `, [
      branch_id, stocktakeNumber, date, title.trim(), type, secId,
      auditor_name?.trim() || null, notes?.trim() || null,
      totalSysWeight
    ]);

    const stocktake = insertHeaderRes.rows[0];

    // Insert snapshot items
    if (invRes.rows.length > 0) {
      for (const inv of invRes.rows) {
        const sysWeight = Number(inv.available_quantity || 0);
        const sysRolls = Number(inv.available_rolls || 0);
        const uPrice = Number(inv.unit_price || 0);

        await client.query(`
          INSERT INTO stocktake_items (
            stocktake_id, branch_id, inventory_id, section_id,
            product, company, unit_price,
            system_weight, system_rolls,
            actual_weight, actual_rolls,
            weight_diff, rolls_diff, financial_diff
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9,
            NULL, NULL,
            0, 0, 0
          )
        `, [
          stocktake.id, branch_id, inv.id, inv.section_id || null,
          inv.product, inv.company || '', uPrice,
          sysWeight, sysRolls
        ]);
      }
    }

    await client.query('COMMIT');
    return sendSuccess(res, stocktake, 201, 'تم إنشاء جلسة الجرد بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── PUT update stocktake metadata ──────────────────────────────────────────
const updateStocktake = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;
    const { title, date, auditor_name, notes, status } = req.body;

    const existingRes = await pool.query(
      `SELECT * FROM stocktakes WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    if (existingRes.rows.length === 0) {
      return sendError(res, 'جلسة الجرد غير موجودة', 404);
    }

    const current = existingRes.rows[0];
    if (current.status === 'settled' && status && status !== 'settled') {
      return sendError(res, 'لا يمكن تعديل حالة جلسة جرد معتمدة ومُسوّاة بالفعل');
    }

    const newTitle = title !== undefined ? title.trim() : current.title;
    const newDate = date !== undefined ? date : current.date;
    const newAuditor = auditor_name !== undefined ? auditor_name.trim() : current.auditor_name;
    const newNotes = notes !== undefined ? notes.trim() : current.notes;
    const newStatus = (status && current.status !== 'settled') ? status : current.status;

    const updateRes = await pool.query(`
      UPDATE stocktakes
      SET title = $1, date = $2, auditor_name = $3, notes = $4, status = $5, updated_at = NOW()
      WHERE id = $6 AND branch_id = $7
      RETURNING *
    `, [newTitle, newDate, newAuditor, newNotes, newStatus, id, branch_id]);

    return sendSuccess(res, updateRes.rows[0], 200, 'تم تحديث بيانات الجرد بنجاح');
  } catch (err) {
    next(err);
  }
};

// ─── PUT batch update counts for items ──────────────────────────────────────
const saveStocktakeCounts = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;
    const { items = [], mark_as_completed = false } = req.body;

    const checkRes = await client.query(
      `SELECT * FROM stocktakes WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 'جلسة الجرد غير موجودة', 404);
    }

    const currentStocktake = checkRes.rows[0];
    if (currentStocktake.status === 'settled') {
      await client.query('ROLLBACK');
      return sendError(res, 'لا يمكن تعديل عدّاد الأصناف لجلسة جرد معتمدة ومُسوّاة');
    }

    // Update each item provided
    for (const item of items) {
      const { id: itemId, actual_weight, actual_rolls, notes } = item;
      if (!itemId) continue;

      const actWeight = (actual_weight !== null && actual_weight !== undefined && actual_weight !== '')
        ? Number(actual_weight)
        : null;

      const actRolls = (actual_rolls !== null && actual_rolls !== undefined && actual_rolls !== '')
        ? Number(actual_rolls)
        : null;

      // Fetch system values to compute diff accurately
      const itemRow = await client.query(
        `SELECT system_weight, system_rolls, unit_price FROM stocktake_items WHERE id = $1 AND stocktake_id = $2`,
        [itemId, id]
      );

      if (itemRow.rows.length > 0) {
        const row = itemRow.rows[0];
        const sysW = Number(row.system_weight || 0);
        const sysR = Number(row.system_rolls || 0);
        const uPrice = Number(row.unit_price || 0);

        const wDiff = actWeight !== null ? (actWeight - sysW) : 0;
        const rDiff = actRolls !== null ? (actRolls - sysR) : 0;
        const fDiff = wDiff * uPrice;

        await client.query(`
          UPDATE stocktake_items
          SET
            actual_weight = $1,
            actual_rolls = $2,
            weight_diff = $3,
            rolls_diff = $4,
            financial_diff = $5,
            notes = COALESCE($6, notes),
            updated_at = NOW()
          WHERE id = $7 AND stocktake_id = $8 AND branch_id = $9
        `, [
          actWeight, actRolls, wDiff, rDiff, fDiff,
          notes !== undefined ? notes : null,
          itemId, id, branch_id
        ]);
      }
    }

    // Recalculate summary totals from all items
    const aggRes = await client.query(`
      SELECT
        COUNT(CASE WHEN actual_weight IS NOT NULL THEN 1 END) AS items_counted,
        COALESCE(SUM(system_weight), 0) AS total_sys_weight,
        COALESCE(SUM(COALESCE(actual_weight, system_weight)), 0) AS total_act_weight,
        COALESCE(SUM(CASE WHEN actual_weight IS NOT NULL THEN weight_diff ELSE 0 END), 0) AS total_w_diff,
        COALESCE(SUM(CASE WHEN actual_rolls IS NOT NULL THEN rolls_diff ELSE 0 END), 0) AS total_r_diff,
        COALESCE(SUM(CASE WHEN actual_weight IS NOT NULL THEN financial_diff ELSE 0 END), 0) AS total_f_diff
      FROM stocktake_items
      WHERE stocktake_id = $1
    `, [id]);

    const agg = aggRes.rows[0];
    const newStatus = mark_as_completed ? 'completed' : 'in_progress';

    const updatedStocktakeRes = await client.query(`
      UPDATE stocktakes
      SET
        total_items_counted = $1,
        total_system_weight = $2,
        total_actual_weight = $3,
        total_weight_diff = $4,
        total_rolls_diff = $5,
        total_financial_diff = $6,
        status = CASE WHEN status = 'settled' THEN status ELSE $7 END,
        updated_at = NOW()
      WHERE id = $8 AND branch_id = $9
      RETURNING *
    `, [
      Number(agg.items_counted),
      Number(agg.total_sys_weight),
      Number(agg.total_act_weight),
      Number(agg.total_w_diff),
      Number(agg.total_r_diff),
      Number(agg.total_f_diff),
      newStatus,
      id, branch_id
    ]);

    await client.query('COMMIT');
    return sendSuccess(res, updatedStocktakeRes.rows[0], 200, 'تم حفظ نتائج الجرد والعدّ بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── POST settle stocktake (تطبيق واعتماد تسوية المخزن) ─────────────────────
const settleStocktake = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    const checkRes = await client.query(
      `SELECT * FROM stocktakes WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 'جلسة الجرد غير موجودة', 404);
    }

    const stocktake = checkRes.rows[0];
    if (stocktake.status === 'settled') {
      await client.query('ROLLBACK');
      return sendError(res, 'جلسة الجرد هذه معتمدة ومُسوّاة بالفعل سابقاً');
    }

    // Get all items that were counted and have a difference
    const diffItemsRes = await client.query(`
      SELECT *
      FROM stocktake_items
      WHERE stocktake_id = $1 AND actual_weight IS NOT NULL
    `, [id]);

    let adjustmentsCount = 0;

    for (const item of diffItemsRes.rows) {
      const wDiff = Number(item.weight_diff || 0);
      const rDiff = Number(item.rolls_diff || 0);

      // Only adjust if there is a difference and item is linked to inventory
      if ((wDiff !== 0 || rDiff !== 0) && item.inventory_id) {
        if (wDiff > 0) {
          // زيادة في المخزن: زيادة weight_quantity و count
          await client.query(`
            UPDATE inventory
            SET
              weight_quantity = weight_quantity + $1,
              count = GREATEST(0, count + $2),
              updated_at = NOW()
            WHERE id = $3 AND branch_id = $4
          `, [wDiff, rDiff, item.inventory_id, branch_id]);

          // إذا كان مربوطاً بقسم: تقليل issued_weight في القسم إن أمكن
          if (item.section_id) {
            await client.query(`
              UPDATE inventory_sections
              SET
                issued_weight = GREATEST(0, issued_weight - $1),
                updated_at = NOW()
              WHERE id = $2 AND branch_id = $3
            `, [wDiff, item.section_id, branch_id]);
          }
        } else if (wDiff < 0) {
          // عجز في المخزن: زيادة issued_quantity و issued_rolls
          const absWeight = Math.abs(wDiff);
          const absRolls = Math.abs(rDiff);

          await client.query(`
            UPDATE inventory
            SET
              issued_quantity = issued_quantity + $1,
              issued_rolls = COALESCE(issued_rolls, 0) + $2,
              updated_at = NOW()
            WHERE id = $3 AND branch_id = $4
          `, [absWeight, absRolls, item.inventory_id, branch_id]);

          // إذا كان مربوطاً بقسم: زيادة issued_weight في القسم
          if (item.section_id) {
            await client.query(`
              UPDATE inventory_sections
              SET
                issued_weight = issued_weight + $1,
                updated_at = NOW()
              WHERE id = $2 AND branch_id = $3
            `, [absWeight, item.section_id, branch_id]);
          }
        }

        adjustmentsCount++;
      }

      // Mark item as settled
      await client.query(`
        UPDATE stocktake_items
        SET is_settled = true, updated_at = NOW()
        WHERE id = $1
      `, [item.id]);
    }

    // Mark stocktake as settled
    const updatedStocktake = await client.query(`
      UPDATE stocktakes
      SET
        status = 'settled',
        settled_at = NOW(),
        settled_by = $1,
        updated_at = NOW()
      WHERE id = $2 AND branch_id = $3
      RETURNING *
    `, [req.user?.id || null, id, branch_id]);

    await client.query('COMMIT');
    return sendSuccess(res, {
      stocktake: updatedStocktake.rows[0],
      adjusted_items_count: adjustmentsCount
    }, 200, `تم اعتماد وتسوية الجرد بنجاح وتحديث أرصدة ${adjustmentsCount} صنف في المخزن`);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── DELETE stocktake ───────────────────────────────────────────────────────
const deleteStocktake = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    const existingRes = await pool.query(
      `SELECT * FROM stocktakes WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    if (existingRes.rows.length === 0) {
      return sendError(res, 'جلسة الجرد غير موجودة', 404);
    }

    if (existingRes.rows[0].status === 'settled') {
      return sendError(res, 'لا يمكن حذف جلسة جرد معتمدة ومُسوّاة في المخزن لحماية سلامة السجلات');
    }

    await pool.query(
      `DELETE FROM stocktakes WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    return sendSuccess(res, null, 200, 'تم حذف جلسة الجرد بنجاح');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStocktakes,
  getStocktakeById,
  createStocktake,
  updateStocktake,
  saveStocktakeCounts,
  settleStocktake,
  deleteStocktake,
};
