const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * Helper to get current treasury balance for a branch
 */
const getCurrentTreasuryBalance = async (branchId) => {
  // Total treasury in (all channels)
  const tRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_in FROM treasury WHERE branch_id = $1`, [branchId]);
  
  // Treasury in by channel
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

  // Expenses out by channel
  const eRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_exp FROM expenses WHERE branch_id = $1`, [branchId]);
  const eChannelRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN amount ELSE 0 END), 0) AS cash_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_out,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN amount ELSE 0 END), 0) AS bank_out
    FROM expenses WHERE branch_id = $1
  `, [branchId]);

  // Purchases out by channel  
  const pRes = await pool.query(`SELECT COALESCE(SUM(treasury_balance), 0) as total_pur FROM purchases WHERE branch_id = $1`, [branchId]);
  const pChannelRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'cash' THEN treasury_balance ELSE 0 END), 0) AS cash_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'wallet' THEN treasury_balance ELSE 0 END), 0) AS wallet_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'instapay' THEN treasury_balance ELSE 0 END), 0) AS instapay_pur,
      COALESCE(SUM(CASE WHEN COALESCE(channel, 'cash') = 'bank' THEN treasury_balance ELSE 0 END), 0) AS bank_pur
    FROM purchases WHERE branch_id = $1
  `, [branchId]);

  // Outgoing monetary transfers (pending or completed reduce current available treasury)
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

  // Incoming completed monetary transfers (add to treasury upon completion)
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

  // Custodies collection (inflow to treasury - exclude internal deductions and custody transfers)
  const custInRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(c.channel, pt.channel, 'cash') = 'cash' THEN c.amount ELSE 0 END), 0) AS cash_custody_in,
      COALESCE(SUM(CASE WHEN COALESCE(c.channel, pt.channel, 'cash') = 'wallet' THEN c.amount ELSE 0 END), 0) AS wallet_custody_in,
      COALESCE(SUM(CASE WHEN COALESCE(c.channel, pt.channel, 'cash') = 'instapay' THEN c.amount ELSE 0 END), 0) AS instapay_custody_in,
      COALESCE(SUM(CASE WHEN COALESCE(c.channel, pt.channel, 'cash') = 'bank' THEN c.amount ELSE 0 END), 0) AS bank_custody_in
    FROM custodies c
    LEFT JOIN payment_types pt ON pt.id = c.payment_type_id
    WHERE c.branch_id = $1 AND c.type = 'collection' AND (c.sub_type IS NULL OR c.sub_type NOT IN ('deduction', 'transfer_out', 'transfer_in'))
  `, [branchId]).catch(() => ({ rows: [{ cash_custody_in: 0, wallet_custody_in: 0, instapay_custody_in: 0, bank_custody_in: 0 }] }));

  // Custodies disbursement (outflow from treasury - exclude custody transfers)
  const custOutRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(c.channel, pt.channel, 'cash') = 'cash' THEN c.amount ELSE 0 END), 0) AS cash_custody_out,
      COALESCE(SUM(CASE WHEN COALESCE(c.channel, pt.channel, 'cash') = 'wallet' THEN c.amount ELSE 0 END), 0) AS wallet_custody_out,
      COALESCE(SUM(CASE WHEN COALESCE(c.channel, pt.channel, 'cash') = 'instapay' THEN c.amount ELSE 0 END), 0) AS instapay_custody_out,
      COALESCE(SUM(CASE WHEN COALESCE(c.channel, pt.channel, 'cash') = 'bank' THEN c.amount ELSE 0 END), 0) AS bank_custody_out
    FROM custodies c
    LEFT JOIN payment_types pt ON pt.id = c.payment_type_id
    WHERE c.branch_id = $1 AND c.type = 'disbursement' AND (c.sub_type IS NULL OR c.sub_type NOT IN ('transfer_in', 'transfer_out', 'deduction'))
  `, [branchId]).catch(() => ({ rows: [{ cash_custody_out: 0, wallet_custody_out: 0, instapay_custody_out: 0, bank_custody_out: 0 }] }));

  // Channel transfers (transfers between cash, wallet, instapay, bank)
  const chTrfRes = await pool.query(`
    SELECT 
      COALESCE(SUM(CASE WHEN from_channel = 'cash' THEN amount ELSE 0 END), 0) AS cash_trf_out,
      COALESCE(SUM(CASE WHEN to_channel = 'cash' THEN amount ELSE 0 END), 0) AS cash_trf_in,
      COALESCE(SUM(CASE WHEN from_channel = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_trf_out,
      COALESCE(SUM(CASE WHEN to_channel = 'wallet' THEN amount ELSE 0 END), 0) AS wallet_trf_in,
      COALESCE(SUM(CASE WHEN from_channel = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_trf_out,
      COALESCE(SUM(CASE WHEN to_channel = 'instapay' THEN amount ELSE 0 END), 0) AS instapay_trf_in,
      COALESCE(SUM(CASE WHEN from_channel = 'bank' THEN amount ELSE 0 END), 0) AS bank_trf_out,
      COALESCE(SUM(CASE WHEN to_channel = 'bank' THEN amount ELSE 0 END), 0) AS bank_trf_in
    FROM treasury_channel_transfers
    WHERE branch_id = $1
  `, [branchId]).catch(() => ({ rows: [{}] }));

  const ch = tChannelRes.rows[0];
  const ec = eChannelRes.rows[0];
  const pc = pChannelRes.rows[0];
  const tout = trfOutRes.rows[0];
  const tin = trfInRes.rows[0];
  const cin = custInRes.rows[0];
  const cout = custOutRes.rows[0];
  const ct = chTrfRes.rows[0] || {};

  const cashBalance = Number(ch.cash_in) + Number(tin.cash_trf_in) + Number(cin.cash_custody_in) + Number(ct.cash_trf_in || 0)
                    - Number(ec.cash_out) - Number(pc.cash_pur) - Number(tout.cash_trf_out) - Number(cout.cash_custody_out) - Number(ct.cash_trf_out || 0);

  const walletBalance = Number(ch.wallet_in) + Number(tin.wallet_trf_in) + Number(cin.wallet_custody_in) + Number(ct.wallet_trf_in || 0)
                      - Number(ec.wallet_out) - Number(pc.wallet_pur) - Number(tout.wallet_trf_out) - Number(cout.wallet_custody_out) - Number(ct.wallet_trf_out || 0);

  const instapayBalance = Number(ch.instapay_in) + Number(tin.instapay_trf_in) + Number(cin.instapay_custody_in) + Number(ct.instapay_trf_in || 0)
                        - Number(ec.instapay_out) - Number(pc.instapay_pur) - Number(tout.instapay_trf_out) - Number(cout.instapay_custody_out) - Number(ct.instapay_trf_out || 0);

  const bankBalance = Number(ch.bank_in) + Number(tin.bank_trf_in) + Number(cin.bank_custody_in) + Number(ct.bank_trf_in || 0)
                    - Number(ec.bank_out) - Number(pc.bank_pur) - Number(tout.bank_trf_out) - Number(cout.bank_custody_out) - Number(ct.bank_trf_out || 0);

  return {
    // Total treasury balance is affected strictly by cash (نقدي) per client requirement
    total: cashBalance,
    channels: {
      cash: cashBalance,
      wallet: walletBalance,
      instapay: instapayBalance,
      bank: bankBalance
    }
  };
};

// ─── Payment Types ─────────────────────────────────────────────────────────

const getPaymentTypes = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const result = await pool.query(
      `SELECT id, name, channel FROM payment_types WHERE branch_id = $1 AND is_active = true ORDER BY id ASC`, 
      [branch_id]
    );
    return sendSuccess(res, result.rows);
  } catch (err) {
    next(err);
  }
};

const addPaymentType = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { name } = req.body;
    if (!name) return sendError(res, 'اسم نوع الدفع مطلوب');

    const existing = await pool.query(
      `SELECT * FROM payment_types WHERE branch_id = $1 AND name = $2 LIMIT 1`,
      [branch_id, name.trim()]
    );

    if (existing.rows.length > 0) {
      if (!existing.rows[0].is_active) {
        const result = await pool.query(
          `UPDATE payment_types SET is_active = true WHERE id = $1 RETURNING *`,
          [existing.rows[0].id]
        );
        return sendSuccess(res, result.rows[0], 200, 'تم استعادة نوع الدفع بنجاح');
      }
      return sendError(res, 'نوع الدفع موجود بالفعل');
    }

    const result = await pool.query(
      `INSERT INTO payment_types (branch_id, name) VALUES ($1, $2) RETURNING *`,
      [branch_id, name.trim()]
    );
    return sendSuccess(res, result.rows[0], 201, 'تم إضافة نوع الدفع بنجاح');
  } catch (err) {
    next(err);
  }
};

// ─── Treasury Records ──────────────────────────────────────────────────────

const getTreasury = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { payment_type_id, customer_id, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let query = `
      SELECT t.*, c.name as customer_name, p.name as payment_type
      FROM treasury t
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN payment_types p ON p.id = t.payment_type_id
      WHERE t.branch_id = $1
    `;
    const params = [branch_id];
    let paramIndex = 2;


    let countQuery = `
      SELECT COUNT(*) FROM treasury t 
      LEFT JOIN customers c ON c.id = t.customer_id 
      LEFT JOIN payment_types p ON p.id = t.payment_type_id
      WHERE t.branch_id = $1
    `;
    const countParams = [branch_id];
    let countIndex = 2;

    if (payment_type_id) {
      const ids = payment_type_id.split(',').map(v => v.trim()).filter(Boolean);
      if (ids.length === 1) {
        query += ` AND t.payment_type_id = $${paramIndex}`;
        countQuery += ` AND t.payment_type_id = $${countIndex}`;
        params.push(ids[0]); countParams.push(ids[0]);
      } else {
        query += ` AND t.payment_type_id = ANY($${paramIndex}::int[])`;
        countQuery += ` AND t.payment_type_id = ANY($${countIndex}::int[])`;
        params.push(ids.map(Number)); countParams.push(ids.map(Number));
      }
      paramIndex++; countIndex++;
    }

    if (customer_id) {
      const ids = customer_id.split(',').map(v => v.trim()).filter(Boolean);
      if (ids.length === 1) {
        query += ` AND t.customer_id = $${paramIndex}`;
        countQuery += ` AND t.customer_id = $${countIndex}`;
        params.push(ids[0]); countParams.push(ids[0]);
      } else {
        query += ` AND t.customer_id = ANY($${paramIndex}::int[])`;
        countQuery += ` AND t.customer_id = ANY($${countIndex}::int[])`;
        params.push(ids.map(Number)); countParams.push(ids.map(Number));
      }
      paramIndex++; countIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND t.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      countQuery += ` AND t.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      params.push(dateFrom, dateTo); countParams.push(dateFrom, dateTo);
      paramIndex += 2; countIndex += 2;
    } else if (dateFrom) {
      query += ` AND t.date >= $${paramIndex}`;
      countQuery += ` AND t.date >= $${countIndex}`;
      params.push(dateFrom); countParams.push(dateFrom);
      paramIndex++; countIndex++;
    } else if (dateTo) {
      query += ` AND t.date <= $${paramIndex}`;
      countQuery += ` AND t.date <= $${countIndex}`;
      params.push(dateTo); countParams.push(dateTo);
      paramIndex++; countIndex++;
    }

    const { channel } = req.query;
    if (channel) {
      query += ` AND COALESCE(t.channel, p.channel, 'cash') = $${paramIndex}`;
      countQuery += ` AND COALESCE(t.channel, p.channel, 'cash') = $${countIndex}`;
      params.push(channel); countParams.push(channel);
      paramIndex++; countIndex++;
    }

    query += ` ORDER BY t.date DESC, t.id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query(countQuery, countParams);

    const balanceData = await getCurrentTreasuryBalance(branch_id);

    return sendSuccess(res, {
      treasury: result.rows,
      currentBalance: balanceData.total,
      channelBalances: balanceData.channels,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    next(err);
  }
};

const addTreasury = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    let { date, customer_id, customer_name, customer_phone, saveNewCustomer, payment_type_id, amount, notes = '', receipt_image = null } = req.body;
    const applyDebtOffset = req.body.apply_debt_offset === true || req.body.apply_debt_offset === 'true';

    if (!date || !amount || !payment_type_id) {
      throw new Error('التاريخ، نوع الدفع، والمبلغ مطلوبة');
    }

    if (!customer_id && customer_name) {
      const isActive = saveNewCustomer !== undefined ? saveNewCustomer : true;
      const newCust = await client.query(
        `INSERT INTO customers (branch_id, name, phone, is_active) VALUES ($1, $2, $3, $4) RETURNING id`,
        [branch_id, customer_name.trim(), customer_phone ? customer_phone.trim() : null, isActive]
      );
      customer_id = newCust.rows[0].id;
    }

    const depositAmount = Number(amount);
    let debt_offset = 0;
    let net_deposit = depositAmount; // what actually goes to customer credit after offset

    // ── Apply debt offset if requested ─────────────────────────────────────
    if (customer_id && applyDebtOffset) {
      const outstandingRes = await client.query(
        `SELECT cb.id as cb_id, s.id as source_id, s.total as invoice_amount, s.paid_amount, s.remaining_balance as remaining
         FROM sales s
         LEFT JOIN customer_balances cb ON cb.source_id = s.id AND cb.source_type = 'sales' AND cb.branch_id = s.branch_id
         WHERE s.customer_id = $1 AND s.branch_id = $2
           AND s.remaining_balance > 0
         ORDER BY s.date ASC, s.id ASC
         FOR UPDATE OF s`,
        [customer_id, branch_id]
      );

      let remainingDeposit = depositAmount;
      for (const inv of outstandingRes.rows) {
        if (remainingDeposit <= 0) break;
        const canOffset = Math.min(Number(inv.remaining), remainingDeposit);
        if (canOffset <= 0) continue;

        // Update customer_balances: paid_amount ↑, remaining_balance ↓
        if (inv.cb_id) {
          await client.query(
            `UPDATE customer_balances
             SET paid_amount = paid_amount + $1,
                 remaining_balance = GREATEST(0, remaining_balance - $1)
             WHERE id = $2`,
            [canOffset, inv.cb_id]
          );
        }

        // Update the sales record itself: paid_amount ↑, remaining_balance ↓
        await client.query(
          `UPDATE sales
           SET paid_amount = paid_amount + $1,
               remaining_balance = GREATEST(0, remaining_balance - $1)
           WHERE id = $2`,
          [canOffset, inv.source_id]
        );
        debt_offset += canOffset;
        remainingDeposit -= canOffset;
      }

      // After offset, net_deposit = what's left for the customer (credit)
      net_deposit = depositAmount - debt_offset;
    }

    // Insert treasury record (amount = original deposit, notes tracks offset)
    const notesText = applyDebtOffset && debt_offset > 0
      ? `إيداع خزينة (مقاصة دين ${debt_offset.toFixed(2)})${notes ? ' — ' + notes : ''}`
      : `إيداع خزينة${notes ? ': ' + notes : ''}`;

    const ptRes = await client.query(`SELECT channel FROM payment_types WHERE id = $1`, [payment_type_id]);
    const channel = ptRes.rows[0]?.channel || 'cash';

    const result = await client.query(
      `INSERT INTO treasury (branch_id, date, customer_id, payment_type_id, amount, notes, channel, receipt_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [branch_id, date, customer_id || null, payment_type_id, amount, notesText, channel, receipt_image || null]
    );

    const treasuryId = result.rows[0].id;

    if (customer_id) {
      // Update customer balance: debt offset reduces debt, net deposit adjusts remaining debt or adds credit
      const custRes = await client.query(`SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`, [customer_id]);
      if (custRes.rows.length > 0) {
        let currentAvailableCredit = Number(custRes.rows[0].total_payments);
        let currentTotalDebt = Number(custRes.rows[0].customer_total);

        // 1. Debt offset directly reduces the customer's outstanding debt
        if (debt_offset > 0) {
          currentTotalDebt = Math.max(0, currentTotalDebt - debt_offset);
        }

        // 2. Net deposit (what is left of the deposit after offset)
        if (net_deposit > 0) {
          if (currentTotalDebt >= net_deposit) {
            currentTotalDebt -= net_deposit;
          } else {
            let extra = net_deposit - currentTotalDebt;
            currentTotalDebt = 0;
            currentAvailableCredit += extra;
          }
        }

        await client.query(
          `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
          [currentAvailableCredit, currentTotalDebt, customer_id]
        );
      }

      // Record the deposit in customer_balances (paid_amount = full deposit, customer_credit = net_deposit)
      await client.query(
        `INSERT INTO customer_balances (branch_id, date, customer_id, invoice_amount, paid_amount, remaining_balance, customer_credit, source_type, source_id, notes)
         VALUES ($1, $2, $3, 0, $4, 0, $5, 'treasury', $6, $7)`,
        [branch_id, date, customer_id, amount, net_deposit, treasuryId, notesText]
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, { ...result.rows[0], debt_offset }, 201, 'تم إضافة حركة الخزينة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

const updateTreasury = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;
    const { date, customer_id, payment_type_id, amount, notes = '', receipt_image = null } = req.body;

    const ptRes = await pool.query(`SELECT channel FROM payment_types WHERE id = $1`, [payment_type_id]);
    const channel = ptRes.rows[0]?.channel || 'cash';

    const result = await pool.query(
      `UPDATE treasury 
       SET date = $1, customer_id = $2, payment_type_id = $3, amount = $4, notes = $5, channel = $6, receipt_image = $7, updated_at = NOW()
       WHERE id = $8 AND branch_id = $9 RETURNING *`,
      [date, customer_id || null, payment_type_id, amount, notes, channel, receipt_image || null, id, branch_id]
    );

    if (!result.rows[0]) return sendError(res, 'الحركة غير موجودة', 404);

    return sendSuccess(res, result.rows[0], 200, 'تم تحديث الحركة بنجاح');
  } catch (err) {
    next(err);
  }
};

const deleteTreasury = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;

    const treasuryRes = await client.query(`SELECT * FROM treasury WHERE id = $1 AND branch_id = $2 FOR UPDATE`, [id, branch_id]);
    if (treasuryRes.rows.length === 0) throw new Error('الحركة غير موجودة');
    const treasury = treasuryRes.rows[0];

    if (treasury.customer_id) {
      // Check if this treasury entry has a matching customer_balances record.
      // Direct deposits (from treasury page) DO have one; auto-inserts from sales do NOT.
      const cbRes = await client.query(
        `SELECT id FROM customer_balances WHERE source_type = 'treasury' AND source_id = $1`,
        [id]
      );

      if (cbRes.rows.length > 0) {
        // This is a DIRECT DEPOSIT from treasury page — revert customer balance
        await client.query(`DELETE FROM customer_balances WHERE source_type = 'treasury' AND source_id = $1`, [id]);

        // Check if there was a debt offset applied (tracked in notes)
        const match = treasury.notes && treasury.notes.match(/مقاصة دين ([\d.]+)/);
        if (match) {
          let revertOffset = parseFloat(match[1]);
          // Find sales invoices for this customer that have paid_amount > 0, newest first
          const salesRes = await client.query(
            `SELECT cb.id, cb.source_id, cb.paid_amount
             FROM customer_balances cb
             WHERE cb.customer_id = $1 AND cb.branch_id = $2
               AND cb.source_type = 'sales' AND cb.paid_amount > 0
             ORDER BY cb.id DESC
             FOR UPDATE`,
            [treasury.customer_id, branch_id]
          );
          for (const inv of salesRes.rows) {
            if (revertOffset <= 0) break;
            const toRevert = Math.min(Number(inv.paid_amount), revertOffset);
            if (toRevert <= 0) continue;

            await client.query(
              `UPDATE customer_balances
               SET paid_amount = paid_amount - $1,
                   remaining_balance = remaining_balance + $1
               WHERE id = $2`,
              [toRevert, inv.id]
            );

            await client.query(
              `UPDATE sales
               SET paid_amount = paid_amount - $1,
                   remaining_balance = remaining_balance + $1
               WHERE id = $2`,
              [toRevert, inv.source_id]
            );
            revertOffset -= toRevert;
          }
        }

        const custRes = await client.query(`SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`, [treasury.customer_id]);
        if (custRes.rows.length > 0) {
          let currentAvailableCredit = Number(custRes.rows[0].total_payments);
          let currentTotalDebt = Number(custRes.rows[0].customer_total);
          let deposit = Number(treasury.amount);

          if (currentAvailableCredit >= deposit) {
            currentAvailableCredit -= deposit;
          } else {
            let remainingToRevert = deposit - currentAvailableCredit;
            currentAvailableCredit = 0;
            currentTotalDebt += remainingToRevert;
          }

          await client.query(`UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`, [currentAvailableCredit, currentTotalDebt, treasury.customer_id]);
        }
      }
      // else: auto-insert from a sale — do NOT touch customer balance (sale still exists and owns that balance)
    }

    await client.query(`DELETE FROM treasury WHERE id = $1`, [id]);

    await client.query('COMMIT');
    return sendSuccess(res, null, 200, 'تم حذف الحركة بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/treasury/channel-transfers
 * Transfer money between payment channels (e.g. Cash -> Instapay, Cash -> Wallet, etc.)
 */
const addChannelTransfer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { from_channel, to_channel, amount, date, notes } = req.body;

    const validChannels = ['cash', 'wallet', 'instapay', 'bank'];
    if (!validChannels.includes(from_channel)) {
      return sendError(res, 'قناة التحويل (من) غير صالحة', 400);
    }
    if (!validChannels.includes(to_channel)) {
      return sendError(res, 'قناة التحويل (إلى) غير صالحة', 400);
    }
    if (from_channel === to_channel) {
      return sendError(res, 'لا يمكن التحويل لنفس القناة', 400);
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return sendError(res, 'يجب إدخال مبلغ صحيح أكبر من الصفر', 400);
    }

    // Check available balance in from_channel
    const currentBalances = await getCurrentTreasuryBalance(branch_id);
    const available = currentBalances.channels[from_channel] || 0;
    if (available < numAmount) {
      const channelNamesAr = { cash: 'النقدي (كاش)', wallet: 'المحفظة الإلكترونية', instapay: 'انستاباي', bank: 'البنك' };
      return sendError(res, `رصيد ${channelNamesAr[from_channel] || from_channel} الحالي (${available.toFixed(2)} ج.م) غير كافٍ لإتمام التحويل`, 400);
    }

    const trfDate = date || new Date().toISOString().split('T')[0];

    const result = await client.query(
      `INSERT INTO treasury_channel_transfers (branch_id, date, from_channel, to_channel, amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [branch_id, trfDate, from_channel, to_channel, numAmount, notes || '']
    );

    await client.query('COMMIT');

    const updatedBalances = await getCurrentTreasuryBalance(branch_id);

    return sendSuccess(res, {
      transfer: result.rows[0],
      currentBalance: updatedBalances.total,
      channelBalances: updatedBalances.channels,
    }, 201, 'تم تحويل المبلغ بين القنوات بنجاح وتحديث الأرصدة');
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/treasury/channel-transfers
 * Get history of channel transfers
 */
const getChannelTransfers = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { from_channel, to_channel, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const { offset } = paginate(page, limit);

    let whereClause = `WHERE branch_id = $1`;
    const params = [branch_id];
    let paramIndex = 2;

    if (from_channel) {
      whereClause += ` AND from_channel = $${paramIndex}`;
      params.push(from_channel);
      paramIndex++;
    }

    if (to_channel) {
      whereClause += ` AND to_channel = $${paramIndex}`;
      params.push(to_channel);
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
      `SELECT COUNT(*), COALESCE(SUM(amount), 0) AS total_amount FROM treasury_channel_transfers ${whereClause}`,
      params
    );

    const total = parseInt(countRes.rows[0].count, 10);
    const totalAmount = parseFloat(countRes.rows[0].total_amount) || 0;

    const dataParams = [...params, parseInt(limit, 10), offset];
    const dataRes = await pool.query(
      `SELECT * FROM treasury_channel_transfers
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
 * DELETE /api/treasury/channel-transfers/:id
 * Delete a channel transfer record
 */
const deleteChannelTransfer = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const checkRes = await pool.query(
      `SELECT * FROM treasury_channel_transfers WHERE id = $1 AND branch_id = $2`,
      [id, branch_id]
    );

    if (!checkRes.rows.length) {
      return sendError(res, 'سجل التحويل غير موجود', 404);
    }

    await pool.query(`DELETE FROM treasury_channel_transfers WHERE id = $1`, [id]);

    const updatedBalances = await getCurrentTreasuryBalance(branch_id);

    return sendSuccess(res, {
      currentBalance: updatedBalances.total,
      channelBalances: updatedBalances.channels,
    }, 200, 'تم حذف حركة التحويل وإعادة ضبط الأرصدة بنجاح');
  } catch (err) {
    next(err);
  }
};

module.exports = { 
  getCurrentTreasuryBalance,
  getPaymentTypes, addPaymentType, 
  getTreasury, addTreasury, updateTreasury, deleteTreasury,
  addChannelTransfer, getChannelTransfers, deleteChannelTransfer
};
