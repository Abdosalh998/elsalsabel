const pool = require('../../config/db');
const { sendSuccess, sendError, paginate } = require('../../utils/helpers');

/**
 * GET /api/returns
 * Fetches returns list with filters and summary totals
 */
const getReturns = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const {
      customer_id, product, company, dateFrom, dateTo, search,
      page = 1, limit = 50
    } = req.query;
    const { offset } = paginate(page, limit);

    let query = `
      SELECT r.id, r.date, r.product, r.company, r.weight, r.rolls_count, r.price_per_ton, r.total,
             r.notes, r.add_to_balance, r.created_at, r.updated_at,
             r.sale_id, r.inventory_id, r.customer_id,
             c.name as customer_name, c.phone as customer_phone,
             s.invoice_number as sale_invoice_number,
             i.product as inventory_product, i.company as inventory_company
      FROM returns r
      LEFT JOIN customers c ON c.id = r.customer_id
      LEFT JOIN sales s ON s.id = r.sale_id
      LEFT JOIN inventory i ON i.id = r.inventory_id
      WHERE r.branch_id = $1
    `;
    const params = [branch_id];
    let paramIndex = 2;

    let countQuery = `
      SELECT COUNT(*)
      FROM returns r
      LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.branch_id = $1
    `;
    let summaryQuery = `
      SELECT 
        COALESCE(SUM(r.total), 0) as total_returns_amount,
        COALESCE(SUM(r.weight), 0) as total_weight,
        COUNT(r.id) as returns_count
      FROM returns r
      LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.branch_id = $1
    `;
    const countParams = [branch_id];
    let countIndex = 2;

    if (customer_id) {
      const ids = customer_id.split(',').map(v => v.trim()).filter(Boolean);
      if (ids.length === 1) {
        query += ` AND r.customer_id = $${paramIndex}`;
        countQuery += ` AND r.customer_id = $${countIndex}`;
        summaryQuery += ` AND r.customer_id = $${countIndex}`;
        params.push(ids[0]); countParams.push(ids[0]);
      } else {
        query += ` AND r.customer_id = ANY($${paramIndex}::int[])`;
        countQuery += ` AND r.customer_id = ANY($${countIndex}::int[])`;
        summaryQuery += ` AND r.customer_id = ANY($${countIndex}::int[])`;
        params.push(ids.map(Number)); countParams.push(ids.map(Number));
      }
      paramIndex++; countIndex++;
    }

    if (product) {
      const prods = product.split(',').map(v => v.trim()).filter(Boolean);
      if (prods.length === 1) {
        query += ` AND r.product ILIKE $${paramIndex}`;
        countQuery += ` AND r.product ILIKE $${countIndex}`;
        summaryQuery += ` AND r.product ILIKE $${countIndex}`;
        params.push(`%${prods[0]}%`); countParams.push(`%${prods[0]}%`);
      } else {
        query += ` AND r.product = ANY($${paramIndex}::text[])`;
        countQuery += ` AND r.product = ANY($${countIndex}::text[])`;
        summaryQuery += ` AND r.product = ANY($${countIndex}::text[])`;
        params.push(prods); countParams.push(prods);
      }
      paramIndex++; countIndex++;
    }

    if (company) {
      query += ` AND r.company ILIKE $${paramIndex}`;
      countQuery += ` AND r.company ILIKE $${countIndex}`;
      summaryQuery += ` AND r.company ILIKE $${countIndex}`;
      params.push(`%${company}%`); countParams.push(`%${company}%`);
      paramIndex++; countIndex++;
    }

    if (search) {
      query += ` AND (r.product ILIKE $${paramIndex} OR r.company ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex} OR r.notes ILIKE $${paramIndex})`;
      countQuery += ` AND (r.product ILIKE $${countIndex} OR r.company ILIKE $${countIndex} OR c.name ILIKE $${countIndex} OR r.notes ILIKE $${countIndex})`;
      summaryQuery += ` AND (r.product ILIKE $${countIndex} OR r.company ILIKE $${countIndex} OR c.name ILIKE $${countIndex} OR r.notes ILIKE $${countIndex})`;
      params.push(`%${search}%`); countParams.push(`%${search}%`);
      paramIndex++; countIndex++;
    }

    if (dateFrom && dateTo) {
      query += ` AND r.date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      countQuery += ` AND r.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      summaryQuery += ` AND r.date BETWEEN $${countIndex} AND $${countIndex + 1}`;
      params.push(dateFrom, dateTo); countParams.push(dateFrom, dateTo);
      paramIndex += 2; countIndex += 2;
    } else if (dateFrom) {
      query += ` AND r.date >= $${paramIndex}`;
      countQuery += ` AND r.date >= $${countIndex}`;
      summaryQuery += ` AND r.date >= $${countIndex}`;
      params.push(dateFrom); countParams.push(dateFrom);
      paramIndex++; countIndex++;
    } else if (dateTo) {
      query += ` AND r.date <= $${paramIndex}`;
      countQuery += ` AND r.date <= $${countIndex}`;
      summaryQuery += ` AND r.date <= $${countIndex}`;
      params.push(dateTo); countParams.push(dateTo);
      paramIndex++; countIndex++;
    }

    query += ` ORDER BY r.date DESC, r.id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const [result, countResult, summaryResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
      pool.query(summaryQuery, countParams)
    ]);

    return sendSuccess(res, {
      returns: result.rows,
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
 * GET /api/returns/unique-values
 */
const getUniqueValues = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const [productsRes, companiesRes] = await Promise.all([
      pool.query(`SELECT DISTINCT product FROM returns WHERE branch_id = $1 AND product IS NOT NULL ORDER BY product ASC`, [branch_id]),
      pool.query(`SELECT DISTINCT company FROM returns WHERE branch_id = $1 AND company IS NOT NULL AND company != '' ORDER BY company ASC`, [branch_id]),
    ]);

    return sendSuccess(res, {
      products: productsRes.rows.map(r => r.product),
      companies: companiesRes.rows.map(r => r.company)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/returns/:id
 */
const getReturnById = async (req, res, next) => {
  try {
    const { branch_id } = req.user;
    const { id } = req.params;

    const returnRes = await pool.query(`
      SELECT r.*,
             c.name as customer_name, c.phone as customer_phone,
             s.invoice_number as sale_invoice_number,
             i.product as inventory_product, i.company as inventory_company,
             br.name as branch_name, br.phone as branch_phone, br.address as branch_address
      FROM returns r
      LEFT JOIN customers c ON c.id = r.customer_id
      LEFT JOIN sales s ON s.id = r.sale_id
      LEFT JOIN inventory i ON i.id = r.inventory_id
      LEFT JOIN branches br ON br.id = r.branch_id
      WHERE r.id = $1 AND r.branch_id = $2
    `, [id, branch_id]);

    if (returnRes.rows.length === 0) {
      return sendError(res, 'سجل المرتجع غير موجود', 404);
    }

    return sendSuccess(res, returnRes.rows[0]);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/returns
 * Create a direct return
 */
const addReturn = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    let {
      date, customer_id, customer_name, phone = '', saveNewCustomer,
      inventory_id, product, company = '',
      weight, rolls_count = 0, price_per_ton, notes = '', add_to_balance = true
    } = req.body;

    if (!date) throw new Error('التاريخ مطلوب');
    const returnWeight = Number(weight);
    const tonPrice = Number(price_per_ton);
    if (returnWeight <= 0 || tonPrice <= 0) {
      throw new Error('يرجى إدخال وزن وسعر طن صحيحين');
    }

    // Customer resolution
    if (!customer_id && customer_name && customer_name.trim()) {
      const isActive = saveNewCustomer !== false && saveNewCustomer !== 'false';
      const custRes = await client.query(
        `INSERT INTO customers (branch_id, name, phone, is_active) VALUES ($1, $2, $3, $4) RETURNING id`,
        [branch_id, customer_name.trim(), phone ? phone.trim() : null, isActive]
      );
      customer_id = custRes.rows[0].id;
    }
    const finalCustomerId = customer_id || null;

    // Resolve inventory item
    let finalInvId = inventory_id ? Number(inventory_id) : null;
    let finalProduct = product;
    let finalCompany = company;

    let invCheck = null;
    if (finalInvId) {
      invCheck = await client.query(`SELECT id, product, company, section_id FROM inventory WHERE id = $1 AND branch_id = $2 FOR UPDATE`, [finalInvId, branch_id]);
      if (invCheck.rows.length === 0) throw new Error('صنف المخزون المحدد غير موجود');
      if (!finalProduct) finalProduct = invCheck.rows[0].product;
      if (!finalCompany) finalCompany = invCheck.rows[0].company || '';
    } else if (finalProduct) {
      // Find or create inventory item
      const existInv = await client.query(
        `SELECT id, product, company, section_id FROM inventory WHERE product ILIKE $1 AND COALESCE(company,'') = $2 AND branch_id = $3 LIMIT 1 FOR UPDATE`,
        [finalProduct.trim(), (finalCompany || '').trim(), branch_id]
      );
      if (existInv.rows.length > 0) {
        finalInvId = existInv.rows[0].id;
        invCheck = existInv;
      } else {
        const newInv = await client.query(
          `INSERT INTO inventory (branch_id, date, company, product, weight_quantity, count, roll_price, price_per_kg, total, notes)
           VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, 'صنف تم إنشاؤه عبر مرتجع بضاعة') RETURNING id`,
          [branch_id, date, (finalCompany || '').trim(), finalProduct.trim()]
        );
        finalInvId = newInv.rows[0].id;
      }
    } else {
      throw new Error('يرجى تحديد صنف المخزون أو إدخال اسم المنتج');
    }

    const returnTotal = returnWeight * tonPrice; // حاصل ضرب الوزن في سعر الوزن

    // Add weight (and rolls if provided) back to inventory
    await client.query(
      `UPDATE inventory 
       SET weight_quantity = weight_quantity + $1,
           count = count + $2,
           updated_at = NOW()
       WHERE id = $3`,
      [returnWeight, Number(rolls_count) || 0, finalInvId]
    );

    // If item belongs to a section, restore section available weight
    if (invCheck?.rows?.[0]?.section_id) {
      await client.query(
        `UPDATE inventory_sections
         SET issued_weight = GREATEST(0, issued_weight - $1), updated_at = NOW()
         WHERE id = $2 AND branch_id = $3`,
        [returnWeight, invCheck.rows[0].section_id, branch_id]
      );
    }

    const shouldAddToBalance = add_to_balance === true || add_to_balance === 'true';

    // Insert return record first so we have the generated return id
    const returnInsert = await client.query(
      `INSERT INTO returns
         (branch_id, sale_id, customer_id, inventory_id, date, product, company, weight, rolls_count, price_per_ton, total, notes, add_to_balance)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [branch_id, finalCustomerId, finalInvId, date, finalProduct, finalCompany || '', returnWeight, Number(rolls_count) || 0, tonPrice, returnTotal, notes, shouldAddToBalance]
    );
    const returnId = returnInsert.rows[0].id;

    // If add_to_balance is true and customer exists
    if (shouldAddToBalance && finalCustomerId) {
      const custRes = await client.query(
        `SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`,
        [finalCustomerId]
      );
      if (custRes.rows.length > 0) {
        let currentCredit = Number(custRes.rows[0].total_payments || 0);
        let currentDebt = Number(custRes.rows[0].customer_total || 0);

        // ── المقاصة الحقيقية: تسوية الفواتير المفتوحة فعلياً ──────────────────
        // كنموذج treasury.controller.js: نُحدّث sales + customer_balances لكل فاتورة
        let debtOffset = 0;
        let remainingReturn = returnTotal;

        if (currentDebt > 0 && remainingReturn > 0) {
          const outstandingRes = await client.query(
            `SELECT cb.id as cb_id, s.id as sale_id, s.remaining_balance as remaining
             FROM sales s
             LEFT JOIN customer_balances cb
               ON cb.source_id = s.id AND cb.source_type = 'sales' AND cb.branch_id = s.branch_id
             WHERE s.customer_id = $1 AND s.branch_id = $2
               AND s.remaining_balance > 0
             ORDER BY s.date ASC, s.id ASC
             FOR UPDATE OF s`,
            [finalCustomerId, branch_id]
          );

          for (const inv of outstandingRes.rows) {
            if (remainingReturn <= 0) break;
            const canOffset = Math.min(Number(inv.remaining), remainingReturn);
            if (canOffset <= 0) continue;

            // تحديث سجل customer_balances الخاص بالفاتورة
            if (inv.cb_id) {
              await client.query(
                `UPDATE customer_balances
                 SET paid_amount = paid_amount + $1,
                     remaining_balance = GREATEST(0, remaining_balance - $1)
                 WHERE id = $2`,
                [canOffset, inv.cb_id]
              );
            }

            // تحديث فاتورة المبيعات نفسها
            await client.query(
              `UPDATE sales
               SET paid_amount = paid_amount + $1,
                   remaining_balance = GREATEST(0, remaining_balance - $1)
               WHERE id = $2`,
              [canOffset, inv.sale_id]
            );

            debtOffset += canOffset;
            remainingReturn -= canOffset;
          }
        }

        // ما تبقى بعد المقاصة يُضاف كرصيد دائن للعميل
        const creditAdded = remainingReturn;
        currentCredit += creditAdded;
        currentDebt = Math.max(0, currentDebt - debtOffset);

        await client.query(
          `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
          [currentCredit, currentDebt, finalCustomerId]
        );

        let balNote = `مرتجع بضاعة #${returnId}: ${finalProduct} (${returnWeight} طن × ${tonPrice})`;
        if (debtOffset > 0 && creditAdded > 0) {
          balNote += ` [مقاصة مديونية: ${debtOffset.toFixed(2)} + إضافة للرصيد: ${creditAdded.toFixed(2)}]`;
        } else if (debtOffset > 0) {
          balNote += ` [مقاصة مديونية: ${debtOffset.toFixed(2)}]`;
        } else {
          balNote += ` [إضافة لرصيد العميل: ${creditAdded.toFixed(2)}]`;
        }

        await client.query(
          `INSERT INTO customer_balances
           (branch_id, date, customer_id, invoice_amount, paid_amount, remaining_balance, customer_credit, source_type, source_id, notes)
           VALUES ($1, $2, $3, 0, $4, 0, $5, 'returns', $6, $7)`,
          [branch_id, date, finalCustomerId, debtOffset, creditAdded, returnId, balNote]
        );
      }
    }

    await client.query('COMMIT');
    return sendSuccess(res, returnInsert.rows[0], 201, 'تم تسجيل المرتجع وإضافة الوزن للمخزن بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message.includes('مطلوب') || err.message.includes('صحيح') || err.message.includes('موجود')) {
      return sendError(res, err.message, 400);
    }
    next(err);
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/returns/:id
 */
const deleteReturn = async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { branch_id } = req.user;
    const { id } = req.params;

    const returnRes = await client.query(
      `SELECT * FROM returns WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
      [id, branch_id]
    );
    if (returnRes.rows.length === 0) {
      throw new Error('سجل المرتجع غير موجود');
    }
    const ret = returnRes.rows[0];

    // Deduct returned weight (and rolls) from inventory
    if (ret.inventory_id) {
      const invRow = await client.query(`SELECT section_id FROM inventory WHERE id = $1`, [ret.inventory_id]);
      if (invRow.rows[0]?.section_id) {
        await client.query(
          `UPDATE inventory_sections
           SET issued_weight = issued_weight + $1, updated_at = NOW()
           WHERE id = $2 AND branch_id = $3`,
          [Number(ret.weight || 0), invRow.rows[0].section_id, branch_id]
        );
      }
      await client.query(
        `UPDATE inventory 
         SET weight_quantity = GREATEST(0, weight_quantity - $1),
             count = GREATEST(0, count - $2),
             updated_at = NOW()
         WHERE id = $3`,
        [Number(ret.weight || 0), Number(ret.rolls_count || 0), ret.inventory_id]
      );
    }

    // If it was added to customer balance, reverse it
    if (ret.add_to_balance && ret.customer_id) {
      const custRes = await client.query(
        `SELECT total_payments, customer_total FROM customers WHERE id = $1 FOR UPDATE`,
        [ret.customer_id]
      );
      if (custRes.rows.length > 0) {
        const retTot = Number(ret.total || 0);
        let curCredit = Number(custRes.rows[0].total_payments || 0);
        let curDebt = Number(custRes.rows[0].customer_total || 0);

        // ── عكس المقاصة: إعادة فتح الفواتير التي سُدّدت من هذا المرتجع ──────
        // نسحب المبلغ من customer_balances بالمرتجع، ونعيد الـ remaining_balance
        // لكل فاتورة كانت قد اُغلقت/خُفّضت جزئياً بسبب هذا المرتجع
        let amountToReverse = retTot;

        // نبحث عن الفواتير المسدودة (من الأحدث للأقدم لعكس الترتيب الصحيح)
        const settledRes = await client.query(
          `SELECT cb.id as cb_id, s.id as sale_id,
                  s.paid_amount, s.total,
                  cb.paid_amount as cb_paid
           FROM sales s
           LEFT JOIN customer_balances cb
             ON cb.source_id = s.id AND cb.source_type = 'sales' AND cb.branch_id = s.branch_id
           WHERE s.customer_id = $1 AND s.branch_id = $2
             AND s.paid_amount > 0 AND s.paid_amount >= s.remaining_balance
           ORDER BY s.date DESC, s.id DESC
           FOR UPDATE OF s`,
          [ret.customer_id, ret.branch_id]
        );

        for (const inv of settledRes.rows) {
          if (amountToReverse <= 0) break;
          // أقصى ما يمكن عكسه من هذه الفاتورة = ما دُفع عليها
          const canReverse = Math.min(Number(inv.paid_amount), amountToReverse);
          if (canReverse <= 0) continue;

          // إعادة remaining_balance للفاتورة وإنقاص paid_amount
          await client.query(
            `UPDATE sales
             SET paid_amount = GREATEST(0, paid_amount - $1),
                 remaining_balance = remaining_balance + $1
             WHERE id = $2`,
            [canReverse, inv.sale_id]
          );

          if (inv.cb_id) {
            await client.query(
              `UPDATE customer_balances
               SET paid_amount = GREATEST(0, paid_amount - $1),
                   remaining_balance = remaining_balance + $1
               WHERE id = $2`,
              [canReverse, inv.cb_id]
            );
          }

          amountToReverse -= canReverse;
          curDebt += canReverse; // إعادة المديونية
        }

        // ما تبقى بعد عكس المقاصة = ما كان رصيداً دائناً → نُقلّصه من credit
        const creditToReverse = amountToReverse;
        if (curCredit >= creditToReverse) {
          curCredit -= creditToReverse;
        } else {
          curDebt += (creditToReverse - curCredit);
          curCredit = 0;
        }

        await client.query(
          `UPDATE customers SET total_payments = $1, customer_total = $2 WHERE id = $3`,
          [curCredit, curDebt, ret.customer_id]
        );
      }
      await client.query(
        `DELETE FROM customer_balances WHERE source_type = 'returns' AND (source_id = $1 OR notes LIKE $2)`,
        [id, `%${ret.id}%`]
      );
    }

    await client.query(`DELETE FROM returns WHERE id = $1`, [id]);

    await client.query('COMMIT');
    return sendSuccess(res, null, 200, 'تم حذف المرتجع واسترجاع المخزون بنجاح');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message.includes('موجود')) return sendError(res, err.message, 404);
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getReturns,
  getUniqueValues,
  getReturnById,
  addReturn,
  deleteReturn
};
