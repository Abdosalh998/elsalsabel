const pool = require('../../config/db');
const { sendSuccess, sendError } = require('../../utils/helpers');

/**
 * Helper to get current treasury balance for validation
 */
const getBranchTreasuryBalance = async (branchId) => {
  const tRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_in FROM treasury WHERE branch_id = $1`, [branchId]);
  const tChannelRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'cash' THEN t.amount ELSE 0 END), 0) AS cash_in,
      COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'wallet' THEN t.amount ELSE 0 END), 0) AS wallet_in,
      COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'instapay' THEN t.amount ELSE 0 END), 0) AS instapay_in,
      COALESCE(SUM(CASE WHEN COALESCE(t.channel, pt.channel, 'cash') = 'bank' THEN t.amount ELSE 0 END), 0) AS bank_in
    FROM treasury t
    LEFT JOIN payment_types pt ON pt.id = t.payment_type_id
    WHERE t.branch_id = $1
  `, [branchId]);

  const eRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_exp FROM expenses WHERE branch_id = $1`, [branchId]);
  const eChannelRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN amount ELSE 0 END), 0) AS cash_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN amount ELSE 0 END), 0) AS bank_out
    FROM expenses WHERE branch_id = $1
  `, [branchId]);

  const pRes = await pool.query(`SELECT COALESCE(SUM(treasury_balance), 0) as total_pur FROM purchases WHERE branch_id = $1`, [branchId]);
  const pChannelRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN treasury_balance ELSE 0 END), 0) AS cash_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN treasury_balance ELSE 0 END), 0) AS wallet_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN treasury_balance ELSE 0 END), 0) AS instapay_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN treasury_balance ELSE 0 END), 0) AS bank_pur
    FROM purchases WHERE branch_id = $1
  `, [branchId]);

  const trfOutRes = await pool.query(`
    SELECT 
      COALESCE(SUM(amount), 0) as total_trf_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN amount ELSE 0 END), 0) AS cash_trf_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_trf_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_trf_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN amount ELSE 0 END), 0) AS bank_trf_out
    FROM transfers 
    WHERE from_branch_id = $1 AND type = 'monetary' AND status IN ('pending', 'completed')
  `, [branchId]);

  const trfInRes = await pool.query(`
    SELECT 
      COALESCE(SUM(amount), 0) as total_trf_in,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN amount ELSE 0 END), 0) AS cash_trf_in,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_trf_in,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_trf_in,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN amount ELSE 0 END), 0) AS bank_trf_in
    FROM transfers 
    WHERE to_branch_id = $1 AND type = 'monetary' AND status = 'completed'
  `, [branchId]);

  const totalIn = Number(tRes.rows[0].total_in) + Number(trfInRes.rows[0].total_trf_in);
  const totalExp = Number(eRes.rows[0].total_exp);
  const totalPur = Number(pRes.rows[0].total_pur);
  const totalTrfOut = Number(trfOutRes.rows[0].total_trf_out);
  const totalBalance = totalIn - totalExp - totalPur - totalTrfOut;

  const ch = tChannelRes.rows[0];
  const ec = eChannelRes.rows[0];
  const pc = pChannelRes.rows[0];
  const tout = trfOutRes.rows[0];
  const tin = trfInRes.rows[0];

  return {
    total: totalBalance,
    channels: {
      cash: Number(ch.cash_in) + Number(tin.cash_trf_in) - Number(ec.cash_out) - Number(pc.cash_pur) - Number(tout.cash_trf_out),
      wallet: Number(ch.wallet_in) + Number(tin.wallet_trf_in) - Number(ec.wallet_out) - Number(pc.wallet_pur) - Number(tout.wallet_trf_out),
      instapay: Number(ch.instapay_in) + Number(tin.instapay_trf_in) - Number(ec.instapay_out) - Number(pc.instapay_pur) - Number(tout.instapay_trf_out),
      bank: Number(ch.bank_in) + Number(tin.bank_trf_in) - Number(ec.bank_out) - Number(pc.bank_pur) - Number(tout.bank_trf_out)
    }
  };
};

/**
 * 1. Get transfers list with filters & stats
 * GET /api/transfers?direction=all|outgoing|incoming&type=all|monetary|inventory&status=all|pending|completed|rejected
 */
const getTransfers = async (req, res, next) => {
  try {
    const userBranchId = req.user.branch_id ? Number(req.user.branch_id) : (req.query.branch_id ? Number(req.query.branch_id) : null);
    const isAdmin = req.user.role === 'admin';
    const { direction = 'all', type = 'all', status = 'all', startDate, endDate, limit = 200 } = req.query;

    const whereClauses = [];
    const params = [];
    let pIdx = 1;

    // Direction filter relative to user's branch
    if (userBranchId) {
      if (direction === 'outgoing') {
        whereClauses.push(`t.from_branch_id = $${pIdx}`);
        params.push(userBranchId);
        pIdx++;
      } else if (direction === 'incoming') {
        whereClauses.push(`t.to_branch_id = $${pIdx}`);
        params.push(userBranchId);
        pIdx++;
      } else {
        whereClauses.push(`(t.from_branch_id = $${pIdx} OR t.to_branch_id = $${pIdx})`);
        params.push(userBranchId);
        pIdx++;
      }
    } else if (!isAdmin) {
      return sendSuccess(res, { stats: {}, transfers: [] });
    }

    if (type !== 'all') {
      whereClauses.push(`t.type = $${pIdx}`);
      params.push(type);
      pIdx++;
    }

    if (status !== 'all') {
      whereClauses.push(`t.status = $${pIdx}`);
      params.push(status);
      pIdx++;
    }

    if (startDate) {
      whereClauses.push(`t.created_at::date >= $${pIdx}`);
      params.push(startDate);
      pIdx++;
    }

    if (endDate) {
      whereClauses.push(`t.created_at::date <= $${pIdx}`);
      params.push(endDate);
      pIdx++;
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const listQuery = `
      SELECT 
        t.id,
        t.transfer_number,
        t.from_branch_id,
        from_b.name AS from_branch_name,
        from_b.code AS from_branch_code,
        t.to_branch_id,
        to_b.name AS to_branch_name,
        to_b.code AS to_branch_code,
        t.type,
        t.status,
        t.amount,
        t.channel,
        t.notes,
        t.rejection_reason,
        t.created_by_user_id,
        u_from.full_name AS created_by_name,
        t.received_by_user_id,
        u_to.full_name AS received_by_name,
        t.created_at,
        t.completed_at,
        ${userBranchId ? `CASE WHEN t.from_branch_id = ${userBranchId} THEN 'outgoing' ELSE 'incoming' END` : `'all'`} AS direction,
        (
          SELECT json_agg(
            json_build_object(
              'id', ti.id,
              'inventory_id', ti.inventory_id,
              'product', ti.product,
              'company', ti.company,
              'weight', ti.weight,
              'rolls_count', ti.rolls_count,
              'notes', ti.notes
            )
          )
          FROM transfer_items ti
          WHERE ti.transfer_id = t.id
        ) AS items
      FROM transfers t
      JOIN branches from_b ON from_b.id = t.from_branch_id
      JOIN branches to_b ON to_b.id = t.to_branch_id
      LEFT JOIN users u_from ON u_from.id = t.created_by_user_id
      LEFT JOIN users u_to ON u_to.id = t.received_by_user_id
      ${whereStr}
      ORDER BY t.created_at DESC
      LIMIT ${Number(limit)}
    `;

    const listRes = await pool.query(listQuery, params);

    // Summary counts
    let statsRes;
    if (userBranchId) {
      statsRes = await pool.query(`
        SELECT
          COUNT(CASE WHEN from_branch_id = $1 THEN 1 END) AS total_outgoing,
          COUNT(CASE WHEN to_branch_id = $1 THEN 1 END) AS total_incoming,
          COUNT(CASE WHEN to_branch_id = $1 AND status = 'pending' THEN 1 END) AS pending_incoming,
          COUNT(CASE WHEN from_branch_id = $1 AND status = 'pending' THEN 1 END) AS pending_outgoing,
          COUNT(CASE WHEN (from_branch_id = $1 OR to_branch_id = $1) AND status = 'completed' THEN 1 END) AS total_completed,
          COALESCE(SUM(CASE WHEN from_branch_id = $1 AND type = 'monetary' AND status = 'completed' THEN amount ELSE 0 END), 0) AS total_monetary_sent,
          COALESCE(SUM(CASE WHEN to_branch_id = $1 AND type = 'monetary' AND status = 'completed' THEN amount ELSE 0 END), 0) AS total_monetary_received
        FROM transfers
        WHERE from_branch_id = $1 OR to_branch_id = $1
      `, [userBranchId]);
    } else {
      statsRes = await pool.query(`
        SELECT
          COUNT(*) AS total_outgoing,
          COUNT(*) AS total_incoming,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_incoming,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_outgoing,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) AS total_completed,
          COALESCE(SUM(CASE WHEN type = 'monetary' AND status = 'completed' THEN amount ELSE 0 END), 0) AS total_monetary_sent,
          COALESCE(SUM(CASE WHEN type = 'monetary' AND status = 'completed' THEN amount ELSE 0 END), 0) AS total_monetary_received
        FROM transfers
      `);
    }

    return sendSuccess(res, {
      stats: statsRes.rows[0],
      transfers: listRes.rows
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 2. Get single transfer with full voucher details for printing
 * GET /api/transfers/:id
 */
const getTransferById = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const query = `
      SELECT 
        t.id,
        t.transfer_number,
        t.from_branch_id,
        from_b.name AS from_branch_name,
        from_b.code AS from_branch_code,
        from_b.phone AS from_branch_phone,
        from_b.address AS from_branch_address,
        t.to_branch_id,
        to_b.name AS to_branch_name,
        to_b.code AS to_branch_code,
        to_b.phone AS to_branch_phone,
        to_b.address AS to_branch_address,
        t.type,
        t.status,
        t.amount,
        t.channel,
        t.notes,
        t.rejection_reason,
        t.created_by_user_id,
        u_from.full_name AS created_by_name,
        t.received_by_user_id,
        u_to.full_name AS received_by_name,
        t.created_at,
        t.completed_at,
        (
          SELECT json_agg(
            json_build_object(
              'id', ti.id,
              'inventory_id', ti.inventory_id,
              'product', ti.product,
              'company', ti.company,
              'weight', ti.weight,
              'rolls_count', ti.rolls_count,
              'notes', ti.notes
            )
          )
          FROM transfer_items ti
          WHERE ti.transfer_id = t.id
        ) AS items
      FROM transfers t
      JOIN branches from_b ON from_b.id = t.from_branch_id
      JOIN branches to_b ON to_b.id = t.to_branch_id
      LEFT JOIN users u_from ON u_from.id = t.created_by_user_id
      LEFT JOIN users u_to ON u_to.id = t.received_by_user_id
      WHERE t.id = $1 AND (t.from_branch_id = $2 OR t.to_branch_id = $2 OR $3 = 'admin')
    `;

    const result = await pool.query(query, [id, branch_id, req.user.role]);
    if (!result.rows.length) {
      return sendError(res, 'إذن التحويل غير موجود أو غير مصرح بعرضه', 404);
    }

    return sendSuccess(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
};

/**
 * 3. Create a new transfer (monetary or inventory)
 * POST /api/transfers
 */
const createTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const from_branch_id = req.user.branch_id || (req.user.role === 'admin' ? (Number(req.body.from_branch_id) || 1) : null);
    const user_id = req.user.id;
    const { to_branch_id, type, amount, channel = 'cash', notes, items = [] } = req.body;

    if (!from_branch_id) {
      return sendError(res, 'يجب تحديد الفرع المرسل للتحويل أو تسجيل الدخول بحساب فرع.', 400);
    }

    if (!to_branch_id) {
      return sendError(res, 'يجب تحديد الفرع المستلم للتحويل', 400);
    }
    if (Number(to_branch_id) === Number(from_branch_id)) {
      return sendError(res, 'لا يمكن إجراء تحويل لنفس الفرع', 400);
    }
    if (!['monetary', 'inventory'].includes(type)) {
      return sendError(res, 'نوع التحويل غير صالح', 400);
    }

    // Verify destination branch exists and is active
    const targetBranchRes = await pool.query(`SELECT id, name FROM branches WHERE id = $1 AND is_active = true`, [to_branch_id]);
    if (!targetBranchRes.rows.length) {
      return sendError(res, 'الفرع المستلم غير موجود أو غير نشط', 400);
    }

    await client.query('BEGIN');

    // Generate unique transfer number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const transfer_number = `TRF-${dateStr}-${randSuffix}`;

    if (type === 'monetary') {
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0) {
        await client.query('ROLLBACK');
        return sendError(res, 'يرجى إدخال مبلغ مالي صحيح أكبر من الصفر', 400);
      }

      // Check current treasury liquidity
      const treasuryBal = await getBranchTreasuryBalance(from_branch_id);
      const chBalance = Number(treasuryBal.channels[channel] || 0);

      if (chBalance < numAmount) {
        await client.query('ROLLBACK');
        return sendError(
          res, 
          `رصيد الخزينة الحالي (${channel === 'cash' ? 'نقدي' : channel === 'wallet' ? 'محفظة' : 'انستاباي'}) غير كافٍ. المتاح: ${chBalance.toLocaleString('en-US')} ج.م، المطلوب تحويله: ${numAmount.toLocaleString('en-US')} ج.م`,
          400
        );
      }

      const insertTrfRes = await client.query(`
        INSERT INTO transfers (
          transfer_number, from_branch_id, to_branch_id, type, status,
          amount, channel, notes, created_by_user_id
        ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)
        RETURNING *
      `, [transfer_number, from_branch_id, to_branch_id, type, numAmount, channel, notes || null, user_id]);

      await client.query('COMMIT');
      return sendSuccess(res, insertTrfRes.rows[0], 'تم إنشاء التحويل المالي وإرساله للفرع الآخر بنجاح', 201);
    } 
    
    // Inventory Transfer
    if (type === 'inventory') {
      if (!Array.isArray(items) || items.length === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 'يجب اختيار صنف واحد على الأقل للتحويل المخزني', 400);
      }

      const insertTrfRes = await client.query(`
        INSERT INTO transfers (
          transfer_number, from_branch_id, to_branch_id, type, status,
          amount, channel, notes, created_by_user_id
        ) VALUES ($1, $2, $3, $4, 'pending', 0, 'cash', $5, $6)
        RETURNING *
      `, [transfer_number, from_branch_id, to_branch_id, type, notes || null, user_id]);

      const transferId = insertTrfRes.rows[0].id;

      for (const it of items) {
        const invId = Number(it.inventory_id);
        const reqWeight = Number(it.weight || 0);
        const reqRolls = Number(it.rolls_count || 0);

        if (!invId) {
          await client.query('ROLLBACK');
          return sendError(res, 'صنف المخزن المحدد غير صالح', 400);
        }
        if (reqWeight <= 0 && reqRolls <= 0) {
          await client.query('ROLLBACK');
          return sendError(res, 'يجب تحديد وزن أو عدد لفات أكبر من صفر للبند المراد تحويله', 400);
        }

        // Lock inventory row and check availability
        const invRes = await client.query(`
          SELECT id, company, product, available_quantity, count, issued_rolls,
                 (count - COALESCE(issued_rolls, 0)) AS available_rolls
          FROM inventory 
          WHERE id = $1 AND branch_id = $2
          FOR UPDATE
        `, [invId, from_branch_id]);

        if (!invRes.rows.length) {
          await client.query('ROLLBACK');
          return sendError(res, 'صنف المخزن غير موجود في رصيد هذا الفرع', 400);
        }

        const invRow = invRes.rows[0];
        const availWeight = Number(invRow.available_quantity || 0);
        const availRolls = Number(invRow.available_rolls || 0);

        if (reqWeight > availWeight) {
          await client.query('ROLLBACK');
          return sendError(
            res, 
            `الوزن المطلوب تحويله للصنف (${invRow.product} - ${invRow.company}) يتجاوز المتاح بالمخزن. المتاح: ${availWeight} كجم، المطلوب: ${reqWeight} كجم`,
            400
          );
        }

        if (reqRolls > availRolls) {
          await client.query('ROLLBACK');
          return sendError(
            res, 
            `عدد اللفات المطلوب تحويله للصنف (${invRow.product} - ${invRow.company}) يتجاوز المتاح. المتاح: ${availRolls} لفة، المطلوب: ${reqRolls} لفة`,
            400
          );
        }

        // Deduct from sender branch by increasing issued_quantity and issued_rolls
        await client.query(`
          UPDATE inventory 
          SET issued_quantity = COALESCE(issued_quantity, 0) + $1,
              issued_rolls = COALESCE(issued_rolls, 0) + $2,
              updated_at = NOW()
          WHERE id = $3
        `, [reqWeight, reqRolls, invId]);

        // Insert into transfer_items
        await client.query(`
          INSERT INTO transfer_items (
            transfer_id, inventory_id, product, company, weight, rolls_count, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [transferId, invId, invRow.product, invRow.company, reqWeight, reqRolls, it.notes || null]);
      }

      await client.query('COMMIT');
      return sendSuccess(res, insertTrfRes.rows[0], 'تم إنشاء إذن تحويل الخامات وإرساله للفرع المستلم بنجاح', 201);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * 4. Confirm receipt of transfer (by receiving branch)
 * POST /api/transfers/:id/confirm
 */
const confirmTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const to_branch_id = req.user.branch_id;
    const user_id = req.user.id;
    const { id } = req.params;

    await client.query('BEGIN');

    // Fetch transfer with lock
    const trfRes = await client.query(`
      SELECT t.*, from_b.name as from_branch_name
      FROM transfers t
      JOIN branches from_b ON from_b.id = t.from_branch_id
      WHERE t.id = $1
      FOR UPDATE
    `, [id]);

    if (!trfRes.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 'إذن التحويل غير موجود', 404);
    }

    const trf = trfRes.rows[0];

    if (Number(trf.to_branch_id) !== Number(to_branch_id) && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return sendError(res, 'غير مصرح لك بتأكيد هذا التحويل، التحويل موجه لفرع آخر', 403);
    }

    if (trf.status !== 'pending') {
      await client.query('ROLLBACK');
      return sendError(res, `لا يمكن تأكيد هذا التحويل لأنه بحالة: ${trf.status === 'completed' ? 'تم استلامه مسبقاً' : 'ملغي / مرفوض'}`, 400);
    }

    // If inventory transfer: insert new stock into receiving branch's inventory
    if (trf.type === 'inventory') {
      const itemsRes = await client.query(`
        SELECT * FROM transfer_items WHERE transfer_id = $1
      `, [id]);

      for (const it of itemsRes.rows) {
        const itemNote = `وارد بتحويل مخزني من (${trf.from_branch_name}) - إذن تحويل رقم #${trf.transfer_number}`;
        await client.query(`
          INSERT INTO inventory (
            branch_id, date, company, product, weight_quantity, count,
            roll_price, issued_quantity, issued_rolls, total, notes
          ) VALUES (
            $1, CURRENT_DATE, $2, $3, $4, $5, 0, 0, 0, 0, $6
          )
        `, [trf.to_branch_id, it.company, it.product, Number(it.weight), Number(it.rolls_count), itemNote]);
      }
    }

    // Update status to completed
    const updatedRes = await client.query(`
      UPDATE transfers 
      SET status = 'completed',
          received_by_user_id = $1,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [user_id, id]);

    await client.query('COMMIT');
    return sendSuccess(res, updatedRes.rows[0], 'تم تأكيد استلام التحويل وإضافته لرصيد الفرع بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * 5. Reject transfer (by receiving branch)
 * POST /api/transfers/:id/reject
 */
const rejectTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const to_branch_id = req.user.branch_id;
    const user_id = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return sendError(res, 'يرجى كتابة سبب رفض الاستلام', 400);
    }

    await client.query('BEGIN');

    const trfRes = await client.query(`
      SELECT * FROM transfers WHERE id = $1 FOR UPDATE
    `, [id]);

    if (!trfRes.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 'إذن التحويل غير موجود', 404);
    }

    const trf = trfRes.rows[0];

    if (Number(trf.to_branch_id) !== Number(to_branch_id) && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return sendError(res, 'غير مصرح لك برفض هذا التحويل', 403);
    }

    if (trf.status !== 'pending') {
      await client.query('ROLLBACK');
      return sendError(res, 'لا يمكن رفض هذا التحويل لأنه لم يعد معلقاً', 400);
    }

    // If inventory: restore stock to sender branch
    if (trf.type === 'inventory') {
      const itemsRes = await client.query(`SELECT * FROM transfer_items WHERE transfer_id = $1`, [id]);
      for (const it of itemsRes.rows) {
        if (it.inventory_id) {
          await client.query(`
            UPDATE inventory 
            SET issued_quantity = GREATEST(0, COALESCE(issued_quantity, 0) - $1),
                issued_rolls = GREATEST(0, COALESCE(issued_rolls, 0) - $2),
                updated_at = NOW()
            WHERE id = $3
          `, [Number(it.weight), Number(it.rolls_count), it.inventory_id]);
        }
      }
    }

    const updatedRes = await client.query(`
      UPDATE transfers 
      SET status = 'rejected',
          rejection_reason = $1,
          received_by_user_id = $2,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [reason.trim(), user_id, id]);

    await client.query('COMMIT');
    return sendSuccess(res, updatedRes.rows[0], 'تم رفض التحويل وإعادة البضاعة / السيولة للفرع الراسل بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * 6. Cancel transfer (by sending branch)
 * POST /api/transfers/:id/cancel
 */
const cancelTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const from_branch_id = req.user.branch_id;
    const { id } = req.params;

    await client.query('BEGIN');

    const trfRes = await client.query(`
      SELECT * FROM transfers WHERE id = $1 FOR UPDATE
    `, [id]);

    if (!trfRes.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 'إذن التحويل غير موجود', 404);
    }

    const trf = trfRes.rows[0];

    if (Number(trf.from_branch_id) !== Number(from_branch_id) && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return sendError(res, 'لا يمكنك إلغاء تحويل لم يصدر من فرعك', 403);
    }

    if (trf.status !== 'pending') {
      await client.query('ROLLBACK');
      return sendError(res, 'لا يمكن إلغاء التحويل لأنه تم تأكيده أو رفضه مسبقاً', 400);
    }

    // If inventory: restore stock to sender branch
    if (trf.type === 'inventory') {
      const itemsRes = await client.query(`SELECT * FROM transfer_items WHERE transfer_id = $1`, [id]);
      for (const it of itemsRes.rows) {
        if (it.inventory_id) {
          await client.query(`
            UPDATE inventory 
            SET issued_quantity = GREATEST(0, COALESCE(issued_quantity, 0) - $1),
                issued_rolls = GREATEST(0, COALESCE(issued_rolls, 0) - $2),
                updated_at = NOW()
            WHERE id = $3
          `, [Number(it.weight), Number(it.rolls_count), it.inventory_id]);
        }
      }
    }

    const updatedRes = await client.query(`
      UPDATE transfers 
      SET status = 'cancelled',
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    await client.query('COMMIT');
    return sendSuccess(res, updatedRes.rows[0], 'تم إلغاء إذن التحويل واستعادة الرصيد للفرع بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * 7. Get available branches to transfer to
 * GET /api/transfers/available-branches
 */
const getAvailableBranches = async (req, res, next) => {
  try {
    const branch_id = req.user.branch_id || (req.query.from_branch_id ? Number(req.query.from_branch_id) : null);
    let query = `SELECT id, name, code, phone, address FROM branches WHERE is_active = true`;
    const params = [];
    if (branch_id) {
      query += ` AND id != $1`;
      params.push(branch_id);
    }
    query += ` ORDER BY name ASC`;

    const result = await pool.query(query, params);
    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

/**
 * 8. Get available inventory in current branch for selecting in transfer
 * GET /api/transfers/available-inventory
 */
const getAvailableInventory = async (req, res, next) => {
  try {
    const branch_id = req.user.branch_id || (req.query.from_branch_id ? Number(req.query.from_branch_id) : 1);
    const result = await pool.query(`
      SELECT 
        i.id,
        i.company,
        i.product,
        i.available_quantity,
        (i.count - COALESCE(i.issued_rolls, 0)) AS available_rolls
      FROM inventory i
      WHERE i.branch_id = $1 AND (i.available_quantity > 0 OR (i.count - COALESCE(i.issued_rolls, 0)) > 0)
      ORDER BY i.company ASC, i.product ASC
    `, [branch_id]);

    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

/**
 * 9. Delete transfer permanently
 * DELETE /api/transfers/:id
 */
const deleteTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const from_branch_id = req.user.branch_id;
    const user_role = req.user.role;
    const { id } = req.params;

    await client.query('BEGIN');

    const trfRes = await client.query(
      `SELECT * FROM transfers WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (!trfRes.rows.length) {
      await client.query('ROLLBACK');
      return sendError(res, 'إذن التحويل غير موجود', 404);
    }

    const trf = trfRes.rows[0];

    // Only sender branch or admin can delete
    if (Number(trf.from_branch_id) !== Number(from_branch_id) && user_role !== 'admin') {
      await client.query('ROLLBACK');
      return sendError(res, 'لا يمكنك حذف تحويل لم يصدر من فرعك', 403);
    }

    // If transfer is still pending, we must restore resources before deleting
    if (trf.status === 'pending') {
      if (trf.type === 'inventory') {
        // Restore issued_quantity and issued_rolls back to sender branch inventory
        const itemsRes = await client.query(
          `SELECT * FROM transfer_items WHERE transfer_id = $1`,
          [id]
        );
        for (const it of itemsRes.rows) {
          if (it.inventory_id) {
            await client.query(
              `UPDATE inventory 
               SET issued_quantity = GREATEST(0, COALESCE(issued_quantity, 0) - $1),
                   issued_rolls = GREATEST(0, COALESCE(issued_rolls, 0) - $2),
                   updated_at = NOW()
               WHERE id = $3 AND branch_id = $4`,
              [Number(it.weight), Number(it.rolls_count), it.inventory_id, from_branch_id]
            );
          }
        }
      }
      // For monetary pending transfers, the amount is already reflected in treasury balance calc
      // (pending outgoing is subtracted automatically) — nothing extra to do
    }

    // If completed, prevent deletion to preserve audit trail
    if (trf.status === 'completed') {
      await client.query('ROLLBACK');
      return sendError(res, 'لا يمكن حذف تحويل مكتمل (تم استلامه). استخدم إلغاء من خلال الإدارة إذا لزم الأمر.', 400);
    }

    // Delete transfer items first (FK), then the transfer
    await client.query(`DELETE FROM transfer_items WHERE transfer_id = $1`, [id]);
    await client.query(`DELETE FROM transfers WHERE id = $1`, [id]);

    await client.query('COMMIT');
    return sendSuccess(res, null, 200, 'تم حذف إذن التحويل نهائياً بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getTransfers,
  getTransferById,
  createTransfer,
  confirmTransfer,
  rejectTransfer,
  cancelTransfer,
  deleteTransfer,
  getAvailableBranches,
  getAvailableInventory
};
