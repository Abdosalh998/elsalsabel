const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * Helper to get current treasury balance for a branch
 */
const getCurrentTreasuryBalance = async (branchId) => {
  // Sum of all Treasury In
  const tRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_in FROM treasury WHERE branch_id = $1`, [branchId]);
  
  // Sum of all Expenses Out
  const eRes = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total_exp FROM expenses WHERE branch_id = $1`, [branchId]);
  
  // Sum of all Purchases Out (amount paid from treasury)
  const pRes = await pool.query(`SELECT COALESCE(SUM(treasury_balance), 0) as total_pur FROM purchases WHERE branch_id = $1`, [branchId]);

  return Number(tRes.rows[0].total_in) - Number(eRes.rows[0].total_exp) - Number(pRes.rows[0].total_pur);
};

// ─── Payment Types ─────────────────────────────────────────────────────────

const getPaymentTypes = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const result = await pool.query(
      `SELECT MIN(id) as id, name FROM payment_types WHERE branch_id = $1 AND is_active = true GROUP BY name ORDER BY id ASC`, 
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

    if (payment_type_id) {
      query += ` AND t.payment_type_id = $${paramIndex}`;
      params.push(payment_type_id);
      paramIndex++;
    }

    if (customer_id) {
      query += ` AND t.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND t.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateFrom, dateTo);
      paramIndex += 2;
    } else if (dateFrom) {
      query += ` AND t.date >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    } else if (dateTo) {
      query += ` AND t.date <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    query += ` ORDER BY t.date DESC, t.id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    let countQuery = `
      SELECT COUNT(*) FROM treasury t 
      LEFT JOIN customers c ON c.id = t.customer_id 
      LEFT JOIN payment_types p ON p.id = t.payment_type_id
      WHERE t.branch_id = $1`;
    const countParams = [branch_id];
    let countIndex = 2;

    if (payment_type_id) {
      countQuery += ` AND t.payment_type_id = $${countIndex}`;
      countParams.push(payment_type_id);
      countIndex++;
    }

    if (customer_id) {
      countQuery += ` AND t.customer_id = $${countIndex}`;
      countParams.push(customer_id);
      countIndex++;
    }

    if (dateFrom && dateTo) {
      countQuery += ` AND t.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      countParams.push(dateFrom, dateTo);
      countIndex += 2;
    } else if (dateFrom) {
      countQuery += ` AND t.date >= $${countIndex}`;
      countParams.push(dateFrom);
      countIndex++;
    } else if (dateTo) {
      countQuery += ` AND t.date <= $${countIndex}`;
      countParams.push(dateTo);
      countIndex++;
    }

    const countResult = await pool.query(countQuery, countParams);

    const currentBalance = await getCurrentTreasuryBalance(branch_id);

    return sendSuccess(res, {
      treasury: result.rows,
      currentBalance,
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
    let { date, customer_id, customer_name, customer_phone, saveNewCustomer, payment_type_id, amount, notes = '' } = req.body;
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
        `SELECT cb.id, cb.source_id, cb.invoice_amount, cb.paid_amount, (cb.invoice_amount - cb.paid_amount) as remaining
         FROM customer_balances cb
         WHERE cb.customer_id = $1 AND cb.branch_id = $2
           AND cb.source_type = 'sales'
           AND (cb.invoice_amount - cb.paid_amount) > 0
         ORDER BY cb.id ASC
         FOR UPDATE`,
        [customer_id, branch_id]
      );

      let remainingDeposit = depositAmount;
      for (const inv of outstandingRes.rows) {
        if (remainingDeposit <= 0) break;
        const canOffset = Math.min(Number(inv.remaining), remainingDeposit);
        if (canOffset <= 0) continue;

        // Update customer_balances: paid_amount ↑, remaining_balance ↓
        await client.query(
          `UPDATE customer_balances
           SET paid_amount = paid_amount + $1,
               remaining_balance = GREATEST(0, remaining_balance - $1)
           WHERE id = $2`,
          [canOffset, inv.id]
        );

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

    const result = await client.query(
      `INSERT INTO treasury (branch_id, date, customer_id, payment_type_id, amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [branch_id, date, customer_id || null, payment_type_id, amount, notesText]
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
    const { date, customer_id, payment_type_id, amount, notes = '' } = req.body;

    const result = await pool.query(
      `UPDATE treasury 
       SET date = $1, customer_id = $2, payment_type_id = $3, amount = $4, notes = $5, updated_at = NOW()
       WHERE id = $6 AND branch_id = $7 RETURNING *`,
      [date, customer_id || null, payment_type_id, amount, notes, id, branch_id]
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

module.exports = { 
  getCurrentTreasuryBalance,
  getPaymentTypes, addPaymentType, 
  getTreasury, addTreasury, updateTreasury, deleteTreasury 
};
