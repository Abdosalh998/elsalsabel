const pool = require('../../config/db');
const { sendSuccess, sendError, paginate, getEffectiveBranchId } = require('../../utils/helpers');

/**
 * GET /api/custody
 * Returns paginated custody transactions with filters + summary metrics
 */
const getCustodies = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { search, person_name, type, channel, payment_type_id, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let baseWhere = branch_id ? `WHERE c.branch_id = $1` : `WHERE 1=1`;
    const params = branch_id ? [branch_id] : [];
    let paramIndex = params.length + 1;

    if (search) {
      baseWhere += ` AND (c.person_name ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex} OR c.receipt_number ILIKE $${paramIndex} OR c.notes ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (person_name) {
      baseWhere += ` AND LOWER(TRIM(c.person_name)) = LOWER(TRIM($${paramIndex}))`;
      params.push(person_name);
      paramIndex++;
    }

    if (type) {
      baseWhere += ` AND c.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (channel) {
      baseWhere += ` AND COALESCE(c.channel, pt.channel, 'cash') = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    if (payment_type_id) {
      baseWhere += ` AND c.payment_type_id = $${paramIndex}`;
      params.push(payment_type_id);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      baseWhere += ` AND c.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      baseWhere += ` AND c.date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      baseWhere += ` AND c.date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    // Summary calculation
    const summaryResult = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE 0 END), 0) AS total_disbursed,
        COALESCE(SUM(CASE WHEN c.type = 'collection' THEN c.amount ELSE 0 END), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE -c.amount END), 0) AS net_outstanding,
        COUNT(DISTINCT LOWER(TRIM(c.person_name))) AS persons_count,
        COUNT(*) AS total_count
       FROM custodies c
       LEFT JOIN payment_types pt ON pt.id = c.payment_type_id
       ${baseWhere}`,
      params
    );

    // Total count for pagination
    const total = parseInt(summaryResult.rows[0].total_count, 10);

    // Query data rows
    const dataParams = [...params, parseInt(limit, 10), offset];
    const dataResult = await pool.query(
      `SELECT
        c.*,
        pt.name AS payment_type_name,
        COALESCE(c.channel, pt.channel, 'cash') AS effective_channel
       FROM custodies c
       LEFT JOIN payment_types pt ON pt.id = c.payment_type_id
       ${baseWhere}
       ORDER BY c.date DESC, c.id DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      dataParams
    );

    return sendSuccess(res, {
      custodies: dataResult.rows,
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
 * GET /api/custody/persons
 * Returns a summary of all persons with their total disbursed, collected, and current balance
 */
const getPersonsSummary = async (req, res, next) => {
  try {
    const branch_id = getEffectiveBranchId(req);
    const { search } = req.query;

    let searchClause = '';
    const params = branch_id ? [branch_id] : [];
    let idx = params.length + 1;
    if (search) {
      searchClause = ` AND (c.person_name ILIKE $${idx} OR c.phone ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = branch_id ? `WHERE c.branch_id = $1 ${searchClause}` : (search ? `WHERE 1=1 ${searchClause}` : ``);

    const result = await pool.query(
      `SELECT
        c.person_name,
        MAX(c.phone) AS phone,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE 0 END), 0) AS total_disbursed,
        COALESCE(SUM(CASE WHEN c.type = 'collection' THEN c.amount ELSE 0 END), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE -c.amount END), 0) AS balance,
        COUNT(*) AS transactions_count,
        MAX(c.date) AS last_date
       FROM custodies c
       ${whereClause}
       GROUP BY c.person_name
       ORDER BY balance DESC, last_date DESC`,
      params
    );

    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/custody/persons/:personName/statement
 * Detailed account statement for a specific person with running balance
 */
const getPersonStatement = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { personName } = req.params;

    const result = await pool.query(
      `SELECT
        c.*,
        pt.name AS payment_type_name,
        COALESCE(c.channel, pt.channel, 'cash') AS effective_channel
       FROM custodies c
       LEFT JOIN payment_types pt ON pt.id = c.payment_type_id
       WHERE c.branch_id = $1 AND LOWER(TRIM(c.person_name)) = LOWER(TRIM($2))
       ORDER BY c.date ASC, c.id ASC`,
      [branch_id, personName]
    );

    let runningBalance = 0;
    const transactions = result.rows.map((row) => {
      const amt = parseFloat(row.amount) || 0;
      if (row.type === 'disbursement') {
        runningBalance += amt;
      } else {
        runningBalance -= amt;
      }
      return {
        ...row,
        running_balance: runningBalance,
      };
    });

    const totalDisbursed = transactions
      .filter((t) => t.type === 'disbursement')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const totalCollected = transactions
      .filter((t) => t.type === 'collection')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    return sendSuccess(res, {
      person_name: personName,
      phone: transactions[transactions.length - 1]?.phone || '',
      total_disbursed: totalDisbursed,
      total_collected: totalCollected,
      balance: runningBalance,
      transactions,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/custody/person-balance
 * Quick balance check for POS / Control Panel
 */
const getPersonBalance = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { name } = req.query;

    if (!name || !name.trim()) {
      return sendSuccess(res, {
        person_name: '',
        exists: false,
        total_disbursed: 0,
        total_collected: 0,
        balance: 0,
        status: 'new',
      });
    }

    const trimmedName = name.trim();
    const result = await pool.query(
      `SELECT
        c.person_name,
        MAX(c.phone) AS phone,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE 0 END), 0) AS total_disbursed,
        COALESCE(SUM(CASE WHEN c.type = 'collection' THEN c.amount ELSE 0 END), 0) AS total_collected,
        COALESCE(SUM(CASE WHEN c.type = 'disbursement' THEN c.amount ELSE -c.amount END), 0) AS balance
       FROM custodies c
       WHERE c.branch_id = $1 AND LOWER(TRIM(c.person_name)) = LOWER(TRIM($2))
       GROUP BY c.person_name`,
      [branch_id, trimmedName]
    );

    if (result.rows.length === 0) {
      return sendSuccess(res, {
        person_name: trimmedName,
        exists: false,
        total_disbursed: 0,
        total_collected: 0,
        balance: 0,
        status: 'new',
      });
    }

    const row = result.rows[0];
    const bal = parseFloat(row.balance) || 0;
    let status = 'settled';
    if (bal > 0) status = 'owing';
    else if (bal < 0) status = 'credit';

    return sendSuccess(res, {
      person_name: row.person_name,
      phone: row.phone || '',
      exists: true,
      total_disbursed: parseFloat(row.total_disbursed) || 0,
      total_collected: parseFloat(row.total_collected) || 0,
      balance: bal,
      status,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/custody
 * Add a new custody record (disbursement or collection)
 */
const addCustody = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const {
      date,
      person_name,
      phone,
      type, // 'disbursement' (تسليم/صرف) or 'collection' (استلام/رد)
      amount,
      payment_type_id,
      channel,
      receipt_number,
      receipt_image,
      notes,
    } = req.body;

    if (!person_name || !person_name.trim()) {
      return sendError(res, 'اسم الشخص مطلوب', 400);
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return sendError(res, 'يجب إدخال مبلغ صحيح أكبر من الصفر', 400);
    }

    if (!type || !['disbursement', 'collection'].includes(type)) {
      return sendError(res, 'نوع الحركة يجب أن يكون تسليم عهدة (disbursement) أو استلام عهدة (collection)', 400);
    }

    // Resolve channel from payment_type_id if channel is not provided
    let effectiveChannel = channel || 'cash';
    if (payment_type_id) {
      const ptRes = await client.query(
        `SELECT channel FROM payment_types WHERE id = $1 AND branch_id = $2`,
        [payment_type_id, branch_id]
      );
      if (ptRes.rows.length && ptRes.rows[0].channel) {
        effectiveChannel = ptRes.rows[0].channel;
      }
    }

    // Auto-generate receipt number if empty
    let finalReceiptNum = receipt_number;
    if (!finalReceiptNum) {
      const prefix = type === 'disbursement' ? 'CSD' : 'CSC';
      const countRes = await client.query(
        `SELECT COUNT(*) FROM custodies WHERE branch_id = $1 AND type = $2`,
        [branch_id, type]
      );
      finalReceiptNum = `${prefix}-${String(parseInt(countRes.rows[0].count, 10) + 1).padStart(4, '0')}`;
    }

    const insertResult = await client.query(
      `INSERT INTO custodies
        (branch_id, date, person_name, phone, type, amount,
         payment_type_id, channel, receipt_number, receipt_image, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        branch_id,
        date || new Date().toISOString().split('T')[0],
        person_name.trim(),
        phone || '',
        type,
        numAmount,
        payment_type_id || null,
        effectiveChannel,
        finalReceiptNum,
        receipt_image || null,
        notes || '',
      ]
    );

    await client.query('COMMIT');
    const msg = type === 'disbursement' ? 'تم تسجيل تسليم العهدة بنجاح' : 'تم تسجيل استلام العهدة بنجاح';
    return sendSuccess(res, insertResult.rows[0], 201, msg);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/custody/:id
 * Update custody record
 */
const updateCustody = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;
    const {
      date,
      person_name,
      phone,
      amount,
      payment_type_id,
      channel,
      receipt_number,
      receipt_image,
      notes,
    } = req.body;

    const existingRes = await pool.query(
      `SELECT * FROM custodies WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (!existingRes.rows.length) {
      return sendError(res, 'سجل العهدة غير موجود', 404);
    }

    let effectiveChannel = channel;
    if (payment_type_id && !channel) {
      const ptRes = await pool.query(
        `SELECT channel FROM payment_types WHERE id = $1 AND branch_id = $2`,
        [payment_type_id, branch_id]
      );
      if (ptRes.rows.length && ptRes.rows[0].channel) {
        effectiveChannel = ptRes.rows[0].channel;
      }
    }

    const updateRes = await pool.query(
      `UPDATE custodies
       SET date = COALESCE($1, date),
           person_name = COALESCE(NULLIF($2, ''), person_name),
           phone = COALESCE($3, phone),
           amount = COALESCE($4, amount),
           payment_type_id = COALESCE($5, payment_type_id),
           channel = COALESCE($6, channel),
           receipt_number = COALESCE($7, receipt_number),
           receipt_image = COALESCE($8, receipt_image),
           notes = COALESCE($9, notes),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        date,
        person_name ? person_name.trim() : null,
        phone,
        amount ? parseFloat(amount) : null,
        payment_type_id,
        effectiveChannel,
        receipt_number,
        receipt_image,
        notes,
        id,
      ]
    );

    return sendSuccess(res, updateRes.rows[0], 200, 'تم تحديث سجل العهدة بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/custody/:id
 * Delete custody record
 */
const deleteCustody = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const existingRes = await pool.query(
      `SELECT * FROM custodies WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (!existingRes.rows.length) {
      return sendError(res, 'سجل العهدة غير موجود', 404);
    }

    if (existingRes.rows[0].transfer_id) {
      const trfId = existingRes.rows[0].transfer_id;
      await pool.query(`DELETE FROM custodies WHERE transfer_id = $1`, [trfId]);
      await pool.query(`DELETE FROM custody_transfers WHERE id = $1`, [trfId]);
    } else {
      await pool.query(`DELETE FROM custodies WHERE id = $1`, [id]);
    }
    return sendSuccess(res, null, 200, 'تم حذف سجل العهدة بنجاح');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/custody/persons/:personName
 * Delete all custody movements and account statement for a person
 */
const deletePersonCustodies = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { personName } = req.params;

    if (!personName || !personName.trim()) {
      return sendError(res, 'اسم الشخص مطلوب', 400);
    }

    const trimmed = personName.trim();

    // Verify existing records
    const checkRes = await client.query(
      `SELECT COUNT(*) FROM custodies WHERE branch_id = $1 AND LOWER(TRIM(person_name)) = LOWER(TRIM($2))`,
      [branch_id, trimmed]
    );
    const count = parseInt(checkRes.rows[0].count, 10);
    if (count === 0) {
      return sendError(res, 'لم يتم العثور على حركات عهد لهذا الشخص', 404);
    }

    // Delete all records of this person in this branch
    await client.query(
      `DELETE FROM custodies WHERE branch_id = $1 AND LOWER(TRIM(person_name)) = LOWER(TRIM($2))`,
      [branch_id, trimmed]
    );

    await client.query('COMMIT');
    return sendSuccess(res, null, 200, `تم حذف الشخص "${trimmed}" وكافة حركات كشف حسابه (${count} حركة) بنجاح`);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/custody/deduction
 * Add deduction (تطريح / صرف بيان من العهدة)
 * Internal tracking only - does NOT affect treasury
 */
const addDeduction = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const {
      date,
      person_name,
      phone,
      amount,
      item_description,
      receipt_number,
      receipt_image,
      notes,
    } = req.body;

    if (!person_name || !person_name.trim()) {
      return sendError(res, 'اسم الشخص مطلوب', 400);
    }

    if (!item_description || !item_description.trim()) {
      return sendError(res, 'بند الصرف (بيان التطريح) مطلوب', 400);
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return sendError(res, 'يجب إدخال مبلغ صحيح أكبر من الصفر', 400);
    }

    // Auto-generate receipt number
    let finalReceiptNum = receipt_number;
    if (!finalReceiptNum) {
      const countRes = await client.query(
        `SELECT COUNT(*) FROM custodies WHERE branch_id = $1 AND sub_type = 'deduction'`,
        [branch_id]
      );
      finalReceiptNum = `DED-${String(parseInt(countRes.rows[0].count, 10) + 1).padStart(4, '0')}`;
    }

    // Insert as type='collection' and sub_type='deduction'
    // This reduces the person's remaining custody balance
    const insertResult = await client.query(
      `INSERT INTO custodies
        (branch_id, date, person_name, phone, type, sub_type, amount,
         item_description, channel, receipt_number, receipt_image, notes)
       VALUES ($1, $2, $3, $4, 'collection', 'deduction', $5, $6, 'cash', $7, $8, $9)
       RETURNING *`,
      [
        branch_id,
        date || new Date().toISOString().split('T')[0],
        person_name.trim(),
        phone || '',
        numAmount,
        item_description.trim(),
        finalReceiptNum,
        receipt_image || null,
        notes || '',
      ]
    );

    await client.query('COMMIT');
    return sendSuccess(res, insertResult.rows[0], 201, 'تم تسجيل التطريح من العهدة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/custody/transfer
 * Transfer custody between two persons (تحويل عهدة بين الأفراد)
 * Internal tracking only - does NOT affect treasury
 */
const addCustodyTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const {
      date,
      from_person,
      to_person,
      amount,
      receipt_number,
      notes,
    } = req.body;

    if (!from_person || !from_person.trim()) {
      return sendError(res, 'الشخص المحوِّل (من) مطلوب', 400);
    }
    if (!to_person || !to_person.trim()) {
      return sendError(res, 'الشخص المستلم (إلى) مطلوب', 400);
    }
    if (from_person.trim().toLowerCase() === to_person.trim().toLowerCase()) {
      return sendError(res, 'لا يمكن التحويل لنفس الشخص', 400);
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return sendError(res, 'يجب إدخال مبلغ صحيح أكبر من الصفر', 400);
    }

    // Auto-generate receipt number for transfer
    let finalReceiptNum = receipt_number;
    if (!finalReceiptNum) {
      const countRes = await client.query(
        `SELECT COUNT(*) FROM custody_transfers WHERE branch_id = $1`,
        [branch_id]
      );
      finalReceiptNum = `CTR-${String(parseInt(countRes.rows[0].count, 10) + 1).padStart(4, '0')}`;
    }

    const trfDate = date || new Date().toISOString().split('T')[0];

    // 1. Insert into custody_transfers
    const trfRes = await client.query(
      `INSERT INTO custody_transfers
        (branch_id, date, from_person, to_person, amount, receipt_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        branch_id,
        trfDate,
        from_person.trim(),
        to_person.trim(),
        numAmount,
        finalReceiptNum,
        notes || '',
      ]
    );
    const transferId = trfRes.rows[0].id;

    // 2. Insert into custodies for from_person (collection/transfer_out -> decreases from_person's balance)
    await client.query(
      `INSERT INTO custodies
        (branch_id, date, person_name, type, sub_type, transfer_id, amount,
         item_description, channel, receipt_number, notes)
       VALUES ($1, $2, $3, 'collection', 'transfer_out', $4, $5, $6, 'cash', $7, $8)`,
      [
        branch_id,
        trfDate,
        from_person.trim(),
        transferId,
        numAmount,
        `تحويل عهدة إلى ${to_person.trim()}`,
        finalReceiptNum,
        notes || '',
      ]
    );

    // 3. Insert into custodies for to_person (disbursement/transfer_in -> increases to_person's balance)
    await client.query(
      `INSERT INTO custodies
        (branch_id, date, person_name, type, sub_type, transfer_id, amount,
         item_description, channel, receipt_number, notes)
       VALUES ($1, $2, $3, 'disbursement', 'transfer_in', $4, $5, $6, 'cash', $7, $8)`,
      [
        branch_id,
        trfDate,
        to_person.trim(),
        transferId,
        numAmount,
        `تحويل عهدة من ${from_person.trim()}`,
        finalReceiptNum,
        notes || '',
      ]
    );

    await client.query('COMMIT');
    return sendSuccess(res, trfRes.rows[0], 201, 'تم تحويل العهدة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/custody/transfers
 * Get custody transfers log
 */
const getCustodyTransfers = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { search, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let whereClause = `WHERE branch_id = $1`;
    const params = [branch_id];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (from_person ILIKE $${paramIndex} OR to_person ILIKE $${paramIndex} OR receipt_number ILIKE $${paramIndex} OR notes ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      whereClause += ` AND date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      whereClause += ` AND date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      whereClause += ` AND date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*), COALESCE(SUM(amount), 0) AS total_amount FROM custody_transfers ${whereClause}`,
      params
    );

    const total = parseInt(countRes.rows[0].count, 10);
    const totalAmount = parseFloat(countRes.rows[0].total_amount) || 0;

    const dataParams = [...params, parseInt(limit, 10), offset];
    const dataRes = await pool.query(
      `SELECT * FROM custody_transfers
       ${whereClause}
       ORDER BY date DESC, id DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      dataParams
    );

    return sendSuccess(res, {
      transfers: dataRes.rows,
      summary: { total_amount: totalAmount, total_count: total },
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
 * DELETE /api/custody/transfers/:id
 * Delete custody transfer and revert both persons balances
 */
const deleteCustodyTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;

    const trfRes = await client.query(
      `SELECT * FROM custody_transfers WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );
    if (!trfRes.rows.length) {
      return sendError(res, 'سجل تحويل العهدة غير موجود', 404);
    }

    // Delete corresponding custodies entries
    await client.query(
      `DELETE FROM custodies WHERE transfer_id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    // Delete transfer record
    await client.query(`DELETE FROM custody_transfers WHERE id = $1`, [id]);

    await client.query('COMMIT');
    return sendSuccess(res, null, 200, 'تم حذف تحويل العهدة وإعادة الأرصدة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getCustodies,
  getPersonsSummary,
  getPersonStatement,
  getPersonBalance,
  addCustody,
  updateCustody,
  deleteCustody,
  deletePersonCustodies,
  addDeduction,
  addCustodyTransfer,
  getCustodyTransfers,
  deleteCustodyTransfer,
};

