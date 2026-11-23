const pool = require('../../config/db');
const { sendSuccess, sendError, paginate, getEffectiveBranchId } = require('../../utils/helpers');

// ─── Helper: Sync Jard with Inventory ────────────────────────────────────────
const syncJardWithInventory = async (branch_id) => {
  if (!branch_id) return { synced: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch grouped inventory products for this branch
    const invRes = await client.query(`
      SELECT
        TRIM(COALESCE(company, '')) AS company,
        TRIM(product) AS product,
        section_id,
        COALESCE(SUM(count), 0)::int AS total_rolls,
        COALESCE(SUM(issued_rolls), 0)::int AS total_issued_rolls,
        COALESCE(SUM(weight_quantity), 0)::numeric AS total_weight,
        COALESCE(SUM(issued_quantity), 0)::numeric AS total_issued_weight,
        MIN(date) AS earliest_date
      FROM inventory
      WHERE branch_id = $1 AND product IS NOT NULL AND TRIM(product) != ''
      GROUP BY TRIM(COALESCE(company, '')), TRIM(product), section_id
    `, [branch_id]);

    let syncedCount = 0;

    for (const inv of invRes.rows) {
      const companyVal = inv.company || 'عام';
      const productVal = inv.product;
      const secId = inv.section_id || null;

      // Check if this item already exists in jard
      const existingJard = await client.query(`
        SELECT id, opening_rolls, opening_weight, incoming_rolls, incoming_weight, outgoing_rolls, outgoing_weight, section_id
        FROM jard
        WHERE branch_id = $1
          AND LOWER(TRIM(COALESCE(company, ''))) = LOWER(TRIM($2))
          AND LOWER(TRIM(product)) = LOWER(TRIM($3))
          AND (
            ($4::int IS NULL AND section_id IS NULL)
            OR section_id = $4::int
          )
        ORDER BY id ASC
        LIMIT 1
      `, [branch_id, companyVal, productVal, secId]);

      if (existingJard.rows.length === 0) {
        // Not in jard yet -> insert
        await client.query(`
          INSERT INTO jard (
            branch_id, date, company, section_id, product,
            opening_rolls, opening_weight,
            incoming_rolls, incoming_weight,
            outgoing_rolls, outgoing_weight,
            notes
          ) VALUES (
            $1, COALESCE($2, CURRENT_DATE), $3, $4, $5,
            $6, $7,
            0, 0,
            $8, $9,
            'مزامنة تلقائية من المخزن'
          )
        `, [
          branch_id,
          inv.earliest_date,
          companyVal,
          secId,
          productVal,
          inv.total_rolls,
          inv.total_weight,
          inv.total_issued_rolls,
          inv.total_issued_weight
        ]);
        syncedCount++;
      } else {
        const curJ = existingJard.rows[0];
        let needsUpdate = false;
        let newSecId = curJ.section_id;
        if (!curJ.section_id && secId) {
          newSecId = secId;
          needsUpdate = true;
        }

        const jardTotalRolls = Number(curJ.opening_rolls || 0) + Number(curJ.incoming_rolls || 0);
        let newIncomingRolls = Number(curJ.incoming_rolls || 0);
        let newIncomingWeight = Number(curJ.incoming_weight || 0);
        if (inv.total_rolls > jardTotalRolls) {
          const deltaRolls = inv.total_rolls - jardTotalRolls;
          newIncomingRolls += deltaRolls;
          needsUpdate = true;
        }

        const jardTotalIssued = Number(curJ.outgoing_rolls || 0);
        let newOutgoingRolls = Number(curJ.outgoing_rolls || 0);
        if (inv.total_issued_rolls > jardTotalIssued) {
          const deltaIssued = inv.total_issued_rolls - jardTotalIssued;
          newOutgoingRolls += deltaIssued;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await client.query(`
            UPDATE jard
            SET section_id = $1,
                incoming_rolls = $2,
                incoming_weight = $3,
                outgoing_rolls = $4,
                updated_at = NOW()
            WHERE id = $5
          `, [newSecId, newIncomingRolls, newIncomingWeight, newOutgoingRolls, curJ.id]);
          syncedCount++;
        }
      }
    }

    await client.query('COMMIT');
    return { synced: syncedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error syncing Jard with inventory:', err);
    throw err;
  } finally {
    client.release();
  }
};

// ─── GET Jard Items List with Filters & Summary ─────────────────────────────
const getJardList = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);

    // Auto-sync items from inventory to jard
    await syncJardWithInventory(branch_id).catch(e => console.error('Auto sync error:', e));
    const {
      page = 1,
      limit = 25,
      company,
      section_id,
      product,
      availability, // 'all', 'in_stock', 'out_of_stock'
      startDate,
      endDate,
      search,
    } = req.query;

    const { limit: l, offset } = paginate(page, limit);

    let where = `WHERE j.branch_id = $1`;
    const params = [branch_id];
    let pIdx = 2;

    if (company && company !== 'all') {
      where += ` AND LOWER(TRIM(j.company)) = LOWER(TRIM($${pIdx++}))`;
      params.push(company);
    }

    if (section_id && section_id !== 'all') {
      where += ` AND j.section_id = $${pIdx++}`;
      params.push(Number(section_id));
    }

    if (product && product.trim()) {
      where += ` AND j.product ILIKE $${pIdx++}`;
      params.push(`%${product.trim()}%`);
    }

    if (availability === 'in_stock') {
      where += ` AND j.available_rolls > 0`;
    } else if (availability === 'out_of_stock') {
      where += ` AND j.available_rolls <= 0`;
    }

    if (startDate) {
      where += ` AND j.date >= $${pIdx++}`;
      params.push(startDate);
    }

    if (endDate) {
      where += ` AND j.date <= $${pIdx++}`;
      params.push(endDate);
    }

    if (search && search.trim()) {
      where += ` AND (j.product ILIKE $${pIdx} OR j.company ILIKE $${pIdx} OR j.notes ILIKE $${pIdx})`;
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    // Summary KPI Query
    const summaryQuery = `
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
    `;
    const summaryRes = await pool.query(summaryQuery, params);

    // List Query
    const listQuery = `
      SELECT
        j.*,
        sec.name AS section_name,
        (SELECT COUNT(*) FROM jard_movements jm WHERE jm.jard_id = j.id) AS movements_count
      FROM jard j
      LEFT JOIN inventory_sections sec ON sec.id = j.section_id
      ${where}
      ORDER BY j.date DESC, j.id DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    const listRes = await pool.query(listQuery, [...params, l, offset]);

    // Distinct companies for filters
    const companiesRes = await pool.query(
      `SELECT DISTINCT TRIM(company) AS company FROM jard WHERE branch_id = $1 AND company IS NOT NULL AND company != '' ORDER BY company ASC`,
      [branch_id]
    );

    const totalCount = Number(summaryRes.rows[0]?.total_items || 0);

    return sendSuccess(res, {
      items: listRes.rows,
      summary: summaryRes.rows[0],
      companies: companiesRes.rows.map(r => r.company),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / Number(limit))
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET Single Jard Item with Movements ────────────────────────────────────
const getJardById = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    const itemRes = await pool.query(`
      SELECT j.*, sec.name AS section_name
      FROM jard j
      LEFT JOIN inventory_sections sec ON sec.id = j.section_id
      WHERE j.id = $1 AND j.branch_id = $2
    `, [id, branch_id]);

    if (itemRes.rows.length === 0) {
      return sendError(res, 'صنف الجرد غير موجود', 404);
    }

    const movementsRes = await pool.query(`
      SELECT jm.*, s.invoice_number AS sale_invoice_number
      FROM jard_movements jm
      LEFT JOIN sales s ON s.id = jm.reference_id AND jm.source = 'pos'
      WHERE jm.jard_id = $1 AND jm.branch_id = $2
      ORDER BY jm.date DESC, jm.id DESC
    `, [id, branch_id]);

    return sendSuccess(res, {
      ...itemRes.rows[0],
      movements: movementsRes.rows
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST Create New Jard Item (رصيد أول المدة) ──────────────────────────────
const addJardItem = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const {
      date = new Date().toISOString().slice(0, 10),
      company,
      section_id,
      product,
      opening_rolls = 0,
      opening_weight = 0,
      notes = ''
    } = req.body;

    if (!company || !company.trim()) {
      return sendError(res, 'اسم الشركة مطلوب');
    }
    if (!product || !product.trim()) {
      return sendError(res, 'اسم الصنف مطلوب');
    }

    const numOpeningRolls = Number(opening_rolls || 0);
    const numOpeningWeight = Number(opening_weight || 0);

    if (numOpeningRolls < 0) {
      return sendError(res, 'رصيد أول المدة لا يمكن أن يكون سالباً');
    }

    const secId = section_id && !isNaN(Number(section_id)) ? Number(section_id) : null;

    const insertRes = await pool.query(`
      INSERT INTO jard (
        branch_id, date, company, section_id, product,
        opening_rolls, opening_weight,
        incoming_rolls, incoming_weight,
        outgoing_rolls, outgoing_weight,
        notes
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        0, 0,
        0, 0,
        $8
      ) RETURNING *
    `, [
      branch_id,
      date,
      company.trim(),
      secId,
      product.trim(),
      numOpeningRolls,
      numOpeningWeight,
      notes?.trim() || null
    ]);

    // Also reflect into inventory so available rolls in inventory reflects this new item
    if (numOpeningRolls > 0 || numOpeningWeight > 0) {
      try {
        const matchInv = await pool.query(`
          SELECT id FROM inventory
          WHERE branch_id = $1
            AND LOWER(TRIM(COALESCE(company, ''))) = LOWER(TRIM(COALESCE($2, '')))
            AND LOWER(TRIM(product)) = LOWER(TRIM($3))
          ORDER BY (section_id = $4) DESC, id DESC
          LIMIT 1
        `, [branch_id, company.trim(), product.trim(), secId]);

        if (matchInv.rows.length > 0) {
          await pool.query(`
            UPDATE inventory
            SET count = COALESCE(count, 0) + $1,
                weight_quantity = COALESCE(weight_quantity, 0) + $2,
                updated_at = NOW()
            WHERE id = $3
          `, [numOpeningRolls, numOpeningWeight, matchInv.rows[0].id]);
        } else {
          await pool.query(`
            INSERT INTO inventory (
              branch_id, date, company, product, section_id,
              count, issued_rolls, weight_quantity, issued_quantity, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 0, 'صنف جديد من موديول الجرد')
          `, [branch_id, date, company.trim(), product.trim(), secId, numOpeningRolls, numOpeningWeight]);
        }
      } catch (invErr) {
        console.error('Error reflecting new Jard item to inventory:', invErr);
      }
    }

    return sendSuccess(res, insertRes.rows[0], 201, 'تمت إضافة صنف الجرد ورصيد أول المدة بنجاح');
  } catch (err) {
    next(err);
  }
};

// ─── PUT Update Jard Item ───────────────────────────────────────────────────
const updateJardItem = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;
    const {
      date,
      company,
      section_id,
      product,
      opening_rolls,
      opening_weight,
      notes
    } = req.body;

    const checkRes = await pool.query(
      `SELECT * FROM jard WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    if (checkRes.rows.length === 0) {
      return sendError(res, 'صنف الجرد غير موجود', 404);
    }

    const cur = checkRes.rows[0];
    const newDate = date !== undefined ? date : cur.date;
    const newCompany = company !== undefined ? company.trim() : cur.company;
    const newProduct = product !== undefined ? product.trim() : cur.product;
    const newSecId = section_id !== undefined ? (section_id ? Number(section_id) : null) : cur.section_id;
    const newOpeningRolls = opening_rolls !== undefined ? Number(opening_rolls) : Number(cur.opening_rolls);
    const newOpeningWeight = opening_weight !== undefined ? Number(opening_weight) : Number(cur.opening_weight);
    const newNotes = notes !== undefined ? notes.trim() : cur.notes;

    // Check if new opening balance would cause negative available rolls
    const projectedAvailableRolls = newOpeningRolls + Number(cur.incoming_rolls) - Number(cur.outgoing_rolls);
    if (projectedAvailableRolls < 0) {
      return sendError(res, `لا يمكن تعديل رصيد أول المدة إلى ${newOpeningRolls} لأن المنصرف الحالي (${cur.outgoing_rolls}) سيتجاوز الرصيد`);
    }

    const updateRes = await pool.query(`
      UPDATE jard
      SET
        date = $1,
        company = $2,
        section_id = $3,
        product = $4,
        opening_rolls = $5,
        opening_weight = $6,
        notes = $7,
        updated_at = NOW()
      WHERE id = $8 AND branch_id = $9
      RETURNING *
    `, [
      newDate, newCompany, newSecId, newProduct,
      newOpeningRolls, newOpeningWeight, newNotes,
      id, branch_id
    ]);

    return sendSuccess(res, updateRes.rows[0], 200, 'تم تحديث بيانات صنف الجرد بنجاح');
  } catch (err) {
    next(err);
  }
};

// ─── DELETE Jard Item ───────────────────────────────────────────────────────
const deleteJardItem = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    const checkRes = await pool.query(
      `SELECT * FROM jard WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    if (checkRes.rows.length === 0) {
      return sendError(res, 'صنف الجرد غير موجود', 404);
    }

    // Check if item has POS sale movements
    const posCheck = await pool.query(
      `SELECT 1 FROM jard_movements WHERE jard_id = $1 AND source = 'pos' LIMIT 1`,
      [id]
    );
    if (posCheck.rows.length > 0) {
      return sendError(res, 'لا يمكن حذف صنف تم تسجيل فواتير مبيعات عليه من رصيد الجرد', 400);
    }

    await pool.query(`DELETE FROM jard WHERE id = $1 AND branch_id = $2`, [id, branch_id]);

    return sendSuccess(res, null, 200, 'تم حذف صنف الجرد بنجاح');
  } catch (err) {
    next(err);
  }
};

// ─── POST Register Movement (وارد أو صادر يدوي) ─────────────────────────────
const addMovement = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const branch_id = getEffectiveBranchId(req);
    const {
      jard_id,
      date = new Date().toISOString().slice(0, 10),
      type, // 'incoming' | 'outgoing'
      rolls = 0,
      weight = 0,
      notes = ''
    } = req.body;

    if (!jard_id) {
      await client.query('ROLLBACK');
      return sendError(res, 'معرف صنف الجرد مطلوب');
    }
    if (!type || !['incoming', 'outgoing'].includes(type)) {
      await client.query('ROLLBACK');
      return sendError(res, 'نوع الحركة يجب أن يكون وارد أو صادر');
    }

    const numRolls = Number(rolls || 0);
    const numWeight = Number(weight || 0);

    if (numRolls <= 0 && numWeight <= 0) {
      await client.query('ROLLBACK');
      return sendError(res, 'يجب إدخال عدد اللفات أو الوزن للحركة');
    }

    // Check jard item
    const jardRes = await client.query(
      `SELECT * FROM jard WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
      [jard_id, branch_id]
    );

    if (jardRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 'صنف الجرد غير موجود', 404);
    }

    const jardItem = jardRes.rows[0];

    // Check outgoing liquidity
    if (type === 'outgoing' && numRolls > Number(jardItem.available_rolls)) {
      await client.query('ROLLBACK');
      return sendError(res, `الرصيد المتاح حالياً بالجرد (${jardItem.available_rolls} لفة) لا يكفي لصرف ${numRolls} لفة`);
    }

    // Insert movement
    const movRes = await client.query(`
      INSERT INTO jard_movements (
        branch_id, jard_id, date, type, source,
        rolls, weight, notes
      ) VALUES (
        $1, $2, $3, $4, 'manual',
        $5, $6, $7
      ) RETURNING *
    `, [
      branch_id, jard_id, date, type,
      numRolls, numWeight, notes?.trim() || null
    ]);

    // Update parent jard item
    if (type === 'incoming') {
      await client.query(`
        UPDATE jard
        SET
          incoming_rolls = incoming_rolls + $1,
          incoming_weight = incoming_weight + $2,
          updated_at = NOW()
        WHERE id = $3 AND branch_id = $4
      `, [numRolls, numWeight, jard_id, branch_id]);

      // Reflect incoming in inventory
      try {
        const matchInv = await client.query(`
          SELECT id FROM inventory
          WHERE branch_id = $1
            AND LOWER(TRIM(COALESCE(company, ''))) = LOWER(TRIM(COALESCE($2, '')))
            AND LOWER(TRIM(product)) = LOWER(TRIM($3))
          ORDER BY (section_id = $4) DESC, id DESC
          LIMIT 1
        `, [branch_id, jardItem.company, jardItem.product, jardItem.section_id]);

        if (matchInv.rows.length > 0) {
          await client.query(`
            UPDATE inventory
            SET count = COALESCE(count, 0) + $1,
                weight_quantity = COALESCE(weight_quantity, 0) + $2,
                updated_at = NOW()
            WHERE id = $3
          `, [numRolls, numWeight, matchInv.rows[0].id]);
        } else {
          await client.query(`
            INSERT INTO inventory (
              branch_id, date, company, product, section_id,
              count, issued_rolls, weight_quantity, issued_quantity, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 0, 'وارد من حركة جرد')
          `, [branch_id, date, jardItem.company, jardItem.product, jardItem.section_id, numRolls, numWeight]);
        }
      } catch (invErr) {
        console.error('Error reflecting incoming to inventory:', invErr);
      }
    } else {
      await client.query(`
        UPDATE jard
        SET
          outgoing_rolls = outgoing_rolls + $1,
          outgoing_weight = outgoing_weight + $2,
          updated_at = NOW()
        WHERE id = $3 AND branch_id = $4
      `, [numRolls, numWeight, jard_id, branch_id]);

      // Reflect outgoing in inventory
      try {
        const matchInv = await client.query(`
          SELECT id FROM inventory
          WHERE branch_id = $1
            AND LOWER(TRIM(COALESCE(company, ''))) = LOWER(TRIM(COALESCE($2, '')))
            AND LOWER(TRIM(product)) = LOWER(TRIM($3))
          ORDER BY (section_id = $4) DESC, id DESC
          LIMIT 1
        `, [branch_id, jardItem.company, jardItem.product, jardItem.section_id]);

        if (matchInv.rows.length > 0) {
          await client.query(`
            UPDATE inventory
            SET issued_rolls = COALESCE(issued_rolls, 0) + $1,
                issued_quantity = COALESCE(issued_quantity, 0) + $2,
                updated_at = NOW()
            WHERE id = $3
          `, [numRolls, numWeight, matchInv.rows[0].id]);
        } else {
          await client.query(`
            INSERT INTO inventory (
              branch_id, date, company, product, section_id,
              count, issued_rolls, weight_quantity, issued_quantity, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $7, 'صادر من حركة جرد')
          `, [branch_id, date, jardItem.company, jardItem.product, jardItem.section_id, numRolls, numWeight]);
        }
      } catch (invErr) {
        console.error('Error reflecting outgoing to inventory:', invErr);
      }
    }

    await client.query('COMMIT');

    const updatedJardRes = await pool.query(`
      SELECT j.*, sec.name AS section_name
      FROM jard j
      LEFT JOIN inventory_sections sec ON sec.id = j.section_id
      WHERE j.id = $1
    `, [jard_id]);

    return sendSuccess(res, {
      movement: movRes.rows[0],
      jard: updatedJardRes.rows[0]
    }, 201, `تم تسجيل حركة ${type === 'incoming' ? 'الوارد' : 'الصادر'} بنجاح`);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── DELETE Movement ────────────────────────────────────────────────────────
const deleteMovement = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    const movRes = await client.query(
      `SELECT * FROM jard_movements WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
      [id, branch_id]
    );

    if (movRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 'حركة الجرد غير موجودة', 404);
    }

    const mov = movRes.rows[0];
    if (mov.source === 'pos') {
      await client.query('ROLLBACK');
      return sendError(res, 'لا يمكن حذف حركة مرتبطة بمبيعات مباشرة من هنا، يجب إلغاء الفاتورة من سجل المبيعات');
    }

    // Fetch parent jard item to identify product & company for inventory reversal
    const parentJardRes = await client.query(
      `SELECT company, product, section_id FROM jard WHERE id = $1 AND branch_id = $2`,
      [mov.jard_id, branch_id]
    );
    const parentJard = parentJardRes.rows[0];

    // Revert from parent
    if (mov.type === 'incoming') {
      await client.query(`
        UPDATE jard
        SET
          incoming_rolls = GREATEST(0, incoming_rolls - $1),
          incoming_weight = GREATEST(0, incoming_weight - $2),
          updated_at = NOW()
        WHERE id = $3 AND branch_id = $4
      `, [Number(mov.rolls), Number(mov.weight), mov.jard_id, branch_id]);

      if (parentJard) {
        await client.query(`
          UPDATE inventory
          SET count = GREATEST(0, COALESCE(count, 0) - $1),
              weight_quantity = GREATEST(0, COALESCE(weight_quantity, 0) - $2),
              updated_at = NOW()
          WHERE id = (
            SELECT id FROM inventory
            WHERE branch_id = $3
              AND LOWER(TRIM(COALESCE(company, ''))) = LOWER(TRIM(COALESCE($4, '')))
              AND LOWER(TRIM(product)) = LOWER(TRIM($5))
            ORDER BY (section_id = $6) DESC, id DESC
            LIMIT 1
          )
        `, [Number(mov.rolls), Number(mov.weight), branch_id, parentJard.company, parentJard.product, parentJard.section_id]);
      }
    } else {
      await client.query(`
        UPDATE jard
        SET
          outgoing_rolls = GREATEST(0, outgoing_rolls - $1),
          outgoing_weight = GREATEST(0, outgoing_weight - $2),
          updated_at = NOW()
        WHERE id = $3 AND branch_id = $4
      `, [Number(mov.rolls), Number(mov.weight), mov.jard_id, branch_id]);

      if (parentJard) {
        await client.query(`
          UPDATE inventory
          SET issued_rolls = GREATEST(0, COALESCE(issued_rolls, 0) - $1),
              issued_quantity = GREATEST(0, COALESCE(issued_quantity, 0) - $2),
              updated_at = NOW()
          WHERE id = (
            SELECT id FROM inventory
            WHERE branch_id = $3
              AND LOWER(TRIM(COALESCE(company, ''))) = LOWER(TRIM(COALESCE($4, '')))
              AND LOWER(TRIM(product)) = LOWER(TRIM($5))
            ORDER BY (section_id = $6) DESC, id DESC
            LIMIT 1
          )
        `, [Number(mov.rolls), Number(mov.weight), branch_id, parentJard.company, parentJard.product, parentJard.section_id]);
      }
    }

    await client.query(`DELETE FROM jard_movements WHERE id = $1`, [id]);
    await client.query('COMMIT');

    return sendSuccess(res, null, 200, 'تم حذف الحركة واسترجاع الرصيد بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── GET Available Jard Items For POS ───────────────────────────────────────
const getJardForPOS = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    await syncJardWithInventory(branch_id).catch(e => console.error('Auto sync error:', e));

    const result = await pool.query(`
      SELECT
        j.id,
        j.product,
        j.company,
        j.section_id,
        sec.name AS section_name,
        j.available_rolls,
        j.available_weight,
        j.date
      FROM jard j
      LEFT JOIN inventory_sections sec ON sec.id = j.section_id
      WHERE j.branch_id = $1 AND j.available_rolls > 0
      ORDER BY sec.name ASC NULLS LAST, j.company ASC, j.product ASC
    `, [branch_id]);

    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

// ─── POST Manual Sync With Inventory ────────────────────────────────────────
const syncWithInventory = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const result = await syncJardWithInventory(branch_id);
    return sendSuccess(res, result, 200, `تمت مزامنة أصناف المخزن مع الجرد بنجاح (${result.synced} صنف محدث/جديد)`);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getJardList,
  getJardById,
  addJardItem,
  updateJardItem,
  deleteJardItem,
  addMovement,
  deleteMovement,
  getJardForPOS,
  syncWithInventory,
  syncJardWithInventory,
};
