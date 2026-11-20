const pool = require('../../config/db');
const { sendSuccess, sendError, getEffectiveBranchId } = require('../../utils/helpers');

// ─── GET all sections for branch ────────────────────────────────────────────
const getSections = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { include_inactive } = req.query;

    let where = `WHERE s.branch_id = $1`;
    if (!include_inactive) where += ` AND s.is_active = true`;

    const result = await pool.query(`
      SELECT
        s.*,
        COALESCE(
          (SELECT SUM(available_quantity)
           FROM inventory i
           WHERE i.section_id = s.id AND i.branch_id = s.branch_id),
          0
        ) AS items_available_weight,
        COALESCE(
          (SELECT COUNT(*)
           FROM inventory i
           WHERE i.section_id = s.id AND i.branch_id = s.branch_id),
          0
        ) AS items_count,
        (s.total_weight - s.issued_weight) AS available_weight
      FROM inventory_sections s
      ${where}
      ORDER BY s.name ASC
    `, [branch_id]);

    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

// ─── GET single section with its inventory items ─────────────────────────────
const getSectionById = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    const secRes = await pool.query(
      `SELECT *, (total_weight - issued_weight) AS available_weight
       FROM inventory_sections
       WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (secRes.rows.length === 0) return sendError(res, 'القسم غير موجود', 404);

    const itemsRes = await pool.query(
      `SELECT id, product, company, weight_quantity, issued_quantity, available_quantity,
              count, issued_rolls, GREATEST(0, count - COALESCE(issued_rolls, 0)) AS available_rolls,
              price_per_kg, roll_price, notes
       FROM inventory
       WHERE section_id = $1 AND branch_id = $2
       ORDER BY product ASC`,
      [id, branch_id]
    );

    return sendSuccess(res, { ...secRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    next(err);
  }
};

// ─── POST create new section ─────────────────────────────────────────────────
const createSection = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { name, total_weight = 0, notes = '' } = req.body;

    if (!name || !name.trim()) return sendError(res, 'اسم القسم مطلوب');
    if (Number(total_weight) < 0) return sendError(res, 'الوزن الإجمالي لا يمكن أن يكون سالباً');

    // Check duplicate name
    const dup = await pool.query(
      `SELECT id FROM inventory_sections WHERE branch_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND is_active = true`,
      [branch_id, name.trim()]
    );
    if (dup.rows.length > 0) return sendError(res, `يوجد قسم بنفس الاسم: "${name.trim()}"`, 409);

    const result = await pool.query(
      `INSERT INTO inventory_sections (branch_id, name, total_weight, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [branch_id, name.trim(), Number(total_weight), notes]
    );

    return sendSuccess(res, result.rows[0], 201);
  } catch (err) {
    next(err);
  }
};

// ─── PUT update section ──────────────────────────────────────────────────────
const updateSection = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;
    const { name, total_weight, notes, is_active } = req.body;

    const existing = await pool.query(
      `SELECT * FROM inventory_sections WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (existing.rows.length === 0) return sendError(res, 'القسم غير موجود', 404);

    const sec = existing.rows[0];

    const newName    = name       !== undefined ? name.trim()          : sec.name;
    const newWeight  = total_weight !== undefined ? Number(total_weight) : Number(sec.total_weight);
    const newNotes   = notes      !== undefined ? notes                : sec.notes;
    const newActive  = is_active  !== undefined ? is_active            : sec.is_active;

    // Guard: new total_weight must not be less than issued_weight
    if (newWeight < Number(sec.issued_weight)) {
      return sendError(res,
        `لا يمكن تعيين الوزن الإجمالي (${newWeight}) أقل من الوزن المُصرف بالفعل (${sec.issued_weight})`
      );
    }

    const result = await pool.query(
      `UPDATE inventory_sections
       SET name = $1, total_weight = $2, notes = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5 AND branch_id = $6
       RETURNING *`,
      [newName, newWeight, newNotes, newActive, id, branch_id]
    );

    return sendSuccess(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// ─── DELETE section ──────────────────────────────────────────────────────────
const deleteSection = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { id } = req.params;

    const existing = await pool.query(
      `SELECT * FROM inventory_sections WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (existing.rows.length === 0) return sendError(res, 'القسم غير موجود', 404);

    if (Number(existing.rows[0].issued_weight) > 0) {
      return sendError(res, 'لا يمكن حذف قسم تم صرف جزء من وزنه، يمكنك تعطيله فقط');
    }

    // Unlink inventory items from this section
    await pool.query(
      `UPDATE inventory SET section_id = NULL WHERE section_id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    await pool.query(
      `DELETE FROM inventory_sections WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    return sendSuccess(res, { message: 'تم حذف القسم بنجاح' });
  } catch (err) {
    next(err);
  }
};

// ─── POST assign inventory item to section ───────────────────────────────────
const assignItemToSection = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { section_id, inventory_id } = req.body;

    if (!inventory_id) return sendError(res, 'معرّف الصنف مطلوب');

    // Validate section belongs to branch
    if (section_id) {
      const secRes = await pool.query(
        `SELECT id FROM inventory_sections WHERE id = $1 AND branch_id = $2`,
        [section_id, branch_id]
      );
      if (secRes.rows.length === 0) return sendError(res, 'القسم غير موجود', 404);
    }

    await pool.query(
      `UPDATE inventory SET section_id = $1 WHERE id = $2 AND branch_id = $3`,
      [section_id || null, inventory_id, branch_id]
    );

    return sendSuccess(res, { message: 'تم تحديث ارتباط الصنف بالقسم' });
  } catch (err) {
    next(err);
  }
};

// ─── GET grouped sections with their items (for POS) ────────────────────────
const getSectionsWithItems = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);

    const result = await pool.query(`
      SELECT
        s.id,
        s.name,
        s.total_weight,
        s.issued_weight,
        (s.total_weight - s.issued_weight) AS available_weight,
        s.notes,
        COALESCE(
          json_agg(
            json_build_object(
              'id',                i.id,
              'product',           TRIM(i.product),
              'company',           COALESCE(i.company, ''),
              'weight_quantity',   i.weight_quantity,
              'issued_quantity',   i.issued_quantity,
              'available_quantity', i.available_quantity,
              'count',             i.count,
              'issued_rolls',      COALESCE(i.issued_rolls, 0),
              'available_rolls',   GREATEST(0, COALESCE(i.count, 0) - COALESCE(i.issued_rolls, 0)),
              'price_per_kg',      i.price_per_kg,
              'roll_price',        i.roll_price
            ) ORDER BY i.product ASC
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'
        ) AS items
      FROM inventory_sections s
      LEFT JOIN inventory i ON i.section_id = s.id AND i.branch_id = s.branch_id
      WHERE s.branch_id = $1 AND s.is_active = true
        AND (s.total_weight - s.issued_weight) > 0
      GROUP BY s.id
      ORDER BY s.name ASC
    `, [branch_id]);

    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
  assignItemToSection,
  getSectionsWithItems,
};
