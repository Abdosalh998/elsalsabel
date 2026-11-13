const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const pool = require('../../config/db');

async function cloneBranch() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting clone of branch 1 (فرع 45) to فرع 45 -2...');
    await client.query('BEGIN');

    const OLD_BRANCH_ID = 1;

    // 1. Check or create new branch
    let newBranchId;
    const branchRes = await client.query('SELECT * FROM branches WHERE name = $1', ['فرع 45 -2']);
    if (branchRes.rows.length > 0) {
      newBranchId = branchRes.rows[0].id;
      console.log(`Branch 'فرع 45 -2' already exists with ID: ${newBranchId}.`);
    } else {
      const oldBranchRes = await client.query('SELECT * FROM branches WHERE id = $1', [OLD_BRANCH_ID]);
      const oldB = oldBranchRes.rows[0];
      const insBranch = await client.query(
        `INSERT INTO branches (name, code, address, phone, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id`,
        ['فرع 45 -2', 'BRANCH_45_2', oldB ? oldB.address : '', oldB ? oldB.phone : '', true]
      );
      newBranchId = insBranch.rows[0].id;
      console.log(`✅ Created branch 'فرع 45 -2' with ID: ${newBranchId}`);
    }

    // 2. Check or create user admin45-2
    // Password: a45n2026-2 (bcrypt hash)
    const passwordHash = '$2b$10$86I.jbRgD1RjMseeWb7fZOA.iRQ4icJbeOILuX34uxWOYO9ZW.qQK';
    const userRes = await client.query('SELECT * FROM users WHERE username = $1', ['admin45-2']);
    if (userRes.rows.length === 0) {
      await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, branch_id, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        ['admin45-2', passwordHash, 'مسؤول فرع 45 -2', 'branch_user', newBranchId, true]
      );
      console.log(`✅ Created user 'admin45-2' (branch_user)`);
    } else {
      await client.query(
        `UPDATE users SET branch_id = $1, password_hash = $2, role = 'branch_user', full_name = 'مسؤول فرع 45 -2', is_active = true WHERE username = $3`,
        [newBranchId, passwordHash, 'admin45-2']
      );
      console.log(`✅ Updated existing user 'admin45-2'`);
    }

    // Maps for foreign keys: old_id -> new_id
    const paymentTypeMap = {};
    const customerMap = {};
    const inventoryMap = {};
    const purchaseMap = {};
    const saleMap = {};
    const returnMap = {};
    const expenseMap = {};
    const treasuryMap = {};
    const custodyTransferMap = {};
    const custodyMap = {};

    // 3. Clone payment_types
    const ptRows = (await client.query('SELECT * FROM payment_types WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const pt of ptRows) {
      const existingPt = await client.query('SELECT id FROM payment_types WHERE branch_id = $1 AND name = $2', [newBranchId, pt.name]);
      if (existingPt.rows.length > 0) {
        paymentTypeMap[pt.id] = existingPt.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO payment_types (branch_id, name, is_system, is_active, channel, created_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [newBranchId, pt.name, pt.is_system, pt.is_active, pt.channel, pt.created_at || new Date()]
        );
        paymentTypeMap[pt.id] = ins.rows[0].id;
      }
    }
    console.log(`✅ payment_types cloned: ${Object.keys(paymentTypeMap).length}`);

    // 4. Clone customers
    const custRows = (await client.query('SELECT * FROM customers WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const c of custRows) {
      const ins = await client.query(
        `INSERT INTO customers (branch_id, name, phone, total_payments, customer_total, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [newBranchId, c.name, c.phone, c.total_payments, c.customer_total, c.is_active, c.created_at, c.updated_at]
      );
      customerMap[c.id] = ins.rows[0].id;
    }
    console.log(`✅ customers cloned: ${Object.keys(customerMap).length}`);

    // 5. Clone inventory
    const invRows = (await client.query('SELECT * FROM inventory WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const inv of invRows) {
      const ins = await client.query(
        `INSERT INTO inventory (
          branch_id, date, company, product, weight_quantity, count, roll_price,
          issued_quantity, total, notes, created_at, updated_at,
          image_url, price_per_kg, issued_rolls, scale_ticket_image, issued_to_coloring, issued_rolls_coloring
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id`,
        [
          newBranchId, inv.date, inv.company, inv.product, inv.weight_quantity, inv.count, inv.roll_price,
          inv.issued_quantity, inv.total, inv.notes, inv.created_at, inv.updated_at,
          inv.image_url, inv.price_per_kg, inv.issued_rolls, inv.scale_ticket_image, inv.issued_to_coloring, inv.issued_rolls_coloring
        ]
      );
      inventoryMap[inv.id] = ins.rows[0].id;
    }
    console.log(`✅ inventory cloned: ${Object.keys(inventoryMap).length}`);

    // 6. Clone purchases (if any)
    const purRows = (await client.query('SELECT * FROM purchases WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const p of purRows) {
      const newCustId = p.customer_id ? customerMap[p.customer_id] : null;
      const newInvId = p.inventory_id ? inventoryMap[p.inventory_id] : null;
      const newPtId = p.payment_type_id ? paymentTypeMap[p.payment_type_id] : null;
      const ins = await client.query(
        `INSERT INTO purchases (
          branch_id, date, customer_id, product, quantity, discount, quantity_after_discount,
          total, treasury_balance, notes, credit_used, created_at, updated_at, transferred_to_inventory,
          inventory_id, payment_type_id, channel, company, weight_quantity, count, roll_price,
          price_per_kg, price_per_ton, receipt_image, scale_ticket_image, material_type, image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        RETURNING id`,
        [
          newBranchId, p.date, newCustId, p.product, p.quantity, p.discount, p.quantity_after_discount,
          p.total, p.treasury_balance, p.notes, p.credit_used, p.created_at, p.updated_at, p.transferred_to_inventory,
          newInvId, newPtId, p.channel, p.company, p.weight_quantity, p.count, p.roll_price,
          p.price_per_kg, p.price_per_ton, p.receipt_image, p.scale_ticket_image, p.material_type, p.image_url
        ]
      );
      purchaseMap[p.id] = ins.rows[0].id;
    }
    console.log(`✅ purchases cloned: ${Object.keys(purchaseMap).length}`);

    // 7. Clone inventory_supplies
    const supRows = (await client.query('SELECT * FROM inventory_supplies WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const s of supRows) {
      const newSuppId = s.supplier_id ? customerMap[s.supplier_id] : null;
      const newPurId = s.purchase_id ? purchaseMap[s.purchase_id] : null;
      await client.query(
        `INSERT INTO inventory_supplies (
          branch_id, date, company, product, weight_quantity, count, price_per_kg,
          roll_price, total, supplier_id, purchase_id, scale_ticket_image, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          newBranchId, s.date, s.company, s.product, s.weight_quantity, s.count, s.price_per_kg,
          s.roll_price, s.total, newSuppId, newPurId, s.scale_ticket_image, s.notes, s.created_at, s.updated_at
        ]
      );
    }
    console.log(`✅ inventory_supplies cloned: ${supRows.length}`);

    // 8. Clone sales
    const saleRows = (await client.query('SELECT * FROM sales WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const s of saleRows) {
      const newCustId = s.customer_id ? customerMap[s.customer_id] : null;
      const newInvId = s.inventory_id ? inventoryMap[s.inventory_id] : null;
      const ins = await client.query(
        `INSERT INTO sales (
          branch_id, invoice_number, date, customer_id, inventory_id, quantity, unit_price,
          total, paid_amount, remaining_balance, customer_credit, notes, created_at, updated_at,
          returns_total, gross_total, receipt_image
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id`,
        [
          newBranchId, s.invoice_number, s.date, newCustId, newInvId, s.quantity, s.unit_price,
          s.total, s.paid_amount, s.remaining_balance, s.customer_credit, s.notes, s.created_at, s.updated_at,
          s.returns_total, s.gross_total, s.receipt_image
        ]
      );
      saleMap[s.id] = ins.rows[0].id;
    }
    console.log(`✅ sales cloned: ${Object.keys(saleMap).length}`);

    // 9. Clone sale_items
    const siRows = (await client.query('SELECT * FROM sale_items WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const si of siRows) {
      const newSaleId = si.sale_id ? saleMap[si.sale_id] : null;
      const newInvId = si.inventory_id ? inventoryMap[si.inventory_id] : null;
      await client.query(
        `INSERT INTO sale_items (
          sale_id, branch_id, inventory_id, quantity, unit_price, total, created_at, weight, rolls_count, price
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          newSaleId, newBranchId, newInvId, si.quantity, si.unit_price, si.total, si.created_at,
          si.weight, si.rolls_count, si.price
        ]
      );
    }
    console.log(`✅ sale_items cloned: ${siRows.length}`);

    // 10. Clone returns
    const retRows = (await client.query('SELECT * FROM returns WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const r of retRows) {
      const newSaleId = r.sale_id ? saleMap[r.sale_id] : null;
      const newCustId = r.customer_id ? customerMap[r.customer_id] : null;
      const newInvId = r.inventory_id ? inventoryMap[r.inventory_id] : null;
      const ins = await client.query(
        `INSERT INTO returns (
          branch_id, sale_id, customer_id, inventory_id, date, product, company,
          weight, price_per_ton, total, notes, add_to_balance, created_at, updated_at, rolls_count, count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id`,
        [
          newBranchId, newSaleId, newCustId, newInvId, r.date, r.product, r.company,
          r.weight, r.price_per_ton, r.total, r.notes, r.add_to_balance, r.created_at, r.updated_at,
          r.rolls_count, r.count
        ]
      );
      returnMap[r.id] = ins.rows[0].id;
    }
    console.log(`✅ returns cloned: ${Object.keys(returnMap).length}`);

    // 11. Clone expenses
    const expRows = (await client.query('SELECT * FROM expenses WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const e of expRows) {
      const newPtId = e.payment_type_id ? paymentTypeMap[e.payment_type_id] : null;
      const ins = await client.query(
        `INSERT INTO expenses (
          branch_id, date, description, amount, treasury_balance_before, treasury_balance_after,
          notes, override_reason, created_at, updated_at, payment_type_id, channel, items,
          recipient_name, receipt_image
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id`,
        [
          newBranchId, e.date, e.description, e.amount, e.treasury_balance_before, e.treasury_balance_after,
          e.notes, e.override_reason, e.created_at, e.updated_at, newPtId, e.channel,
          e.items ? JSON.stringify(e.items) : null, e.recipient_name, e.receipt_image
        ]
      );
      expenseMap[e.id] = ins.rows[0].id;
    }
    console.log(`✅ expenses cloned: ${Object.keys(expenseMap).length}`);

    // 12. Clone coloring_orders
    const colRows = (await client.query('SELECT * FROM coloring_orders WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const co of colRows) {
      const newInvId = co.inventory_id ? inventoryMap[co.inventory_id] : null;
      const newResInvId = co.result_inventory_id ? inventoryMap[co.result_inventory_id] : null;
      const newPtId = co.payment_type_id ? paymentTypeMap[co.payment_type_id] : null;
      const newExpId = co.expense_id ? expenseMap[co.expense_id] : null;
      await client.query(
        `INSERT INTO coloring_orders (
          branch_id, date, order_number, product, inventory_id, issued_weight, issued_rolls,
          returned_weight, returned_rolls, weight_gain, color, colored_product, coloring_cost,
          status, result_inventory_id, notes, image_url, scale_ticket_image, created_at, updated_at,
          payment_type_id, channel, expense_id, coloring_company
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
        [
          newBranchId, co.date, co.order_number, co.product, newInvId, co.issued_weight, co.issued_rolls,
          co.returned_weight, co.returned_rolls, co.weight_gain, co.color, co.colored_product, co.coloring_cost,
          co.status, newResInvId, co.notes, co.image_url, co.scale_ticket_image, co.created_at, co.updated_at,
          newPtId, co.channel, newExpId, co.coloring_company
        ]
      );
    }
    console.log(`✅ coloring_orders cloned: ${colRows.length}`);

    // 13. Clone treasury
    const trRows = (await client.query('SELECT * FROM treasury WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const t of trRows) {
      const newCustId = t.customer_id ? customerMap[t.customer_id] : null;
      const newPtId = t.payment_type_id ? paymentTypeMap[t.payment_type_id] : null;
      const ins = await client.query(
        `INSERT INTO treasury (
          branch_id, date, customer_id, payment_type_id, amount, treasury_balance,
          notes, created_at, updated_at, channel, receipt_image
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          newBranchId, t.date, newCustId, newPtId, t.amount, t.treasury_balance,
          t.notes, t.created_at, t.updated_at, t.channel, t.receipt_image
        ]
      );
      treasuryMap[t.id] = ins.rows[0].id;
    }
    console.log(`✅ treasury cloned: ${Object.keys(treasuryMap).length}`);

    // 14. Clone treasury_channel_transfers
    const tctRows = (await client.query('SELECT * FROM treasury_channel_transfers WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const tct of tctRows) {
      await client.query(
        `INSERT INTO treasury_channel_transfers (
          branch_id, date, from_channel, to_channel, amount, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newBranchId, tct.date, tct.from_channel, tct.to_channel, tct.amount, tct.notes,
          tct.created_at, tct.updated_at
        ]
      );
    }
    console.log(`✅ treasury_channel_transfers cloned: ${tctRows.length}`);

    // 15. Clone customer_balances
    const cbRows = (await client.query('SELECT * FROM customer_balances WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const cb of cbRows) {
      const newCustId = cb.customer_id ? customerMap[cb.customer_id] : null;
      let newSourceId = cb.source_id;
      if (cb.source_type === 'sales' && saleMap[cb.source_id]) {
        newSourceId = saleMap[cb.source_id];
      } else if (cb.source_type === 'returns' && returnMap[cb.source_id]) {
        newSourceId = returnMap[cb.source_id];
      } else if (cb.source_type === 'treasury' && treasuryMap[cb.source_id]) {
        newSourceId = treasuryMap[cb.source_id];
      }
      await client.query(
        `INSERT INTO customer_balances (
          branch_id, date, customer_id, invoice_amount, paid_amount, remaining_balance,
          customer_credit, source_type, source_id, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          newBranchId, cb.date, newCustId, cb.invoice_amount, cb.paid_amount, cb.remaining_balance,
          cb.customer_credit, cb.source_type, newSourceId, cb.notes, cb.created_at, cb.updated_at
        ]
      );
    }
    console.log(`✅ customer_balances cloned: ${cbRows.length}`);

    // 16. Clone customer_balance_adjustments
    const cbaRows = (await client.query('SELECT * FROM customer_balance_adjustments WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const cba of cbaRows) {
      const newCustId = cba.customer_id ? customerMap[cba.customer_id] : null;
      await client.query(
        `INSERT INTO customer_balance_adjustments (
          branch_id, customer_id, date, type, amount, reason, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newBranchId, newCustId, cba.date, cba.type, cba.amount, cba.reason,
          cba.created_at, cba.updated_at
        ]
      );
    }
    console.log(`✅ customer_balance_adjustments cloned: ${cbaRows.length}`);

    // 17. Clone custody_transfers
    const ctfRows = (await client.query('SELECT * FROM custody_transfers WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const ctf of ctfRows) {
      const ins = await client.query(
        `INSERT INTO custody_transfers (
          branch_id, date, from_person, to_person, amount, receipt_number, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          newBranchId, ctf.date, ctf.from_person, ctf.to_person, ctf.amount,
          ctf.receipt_number, ctf.notes, ctf.created_at, ctf.updated_at
        ]
      );
      custodyTransferMap[ctf.id] = ins.rows[0].id;
    }
    console.log(`✅ custody_transfers cloned: ${Object.keys(custodyTransferMap).length}`);

    // 18. Clone custodies (transfer_id maps to custody_transfers)
    const custodiesRows = (await client.query('SELECT * FROM custodies WHERE branch_id = $1 ORDER BY id ASC', [OLD_BRANCH_ID])).rows;
    for (const cu of custodiesRows) {
      const newPtId = cu.payment_type_id ? paymentTypeMap[cu.payment_type_id] : null;
      const newTransferId = cu.transfer_id ? (custodyTransferMap[cu.transfer_id] || null) : null;
      const ins = await client.query(
        `INSERT INTO custodies (
          branch_id, date, person_name, phone, type, amount, payment_type_id,
          channel, receipt_number, receipt_image, notes, created_at, updated_at,
          item_description, sub_type, transfer_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id`,
        [
          newBranchId, cu.date, cu.person_name, cu.phone, cu.type, cu.amount, newPtId,
          cu.channel, cu.receipt_number, cu.receipt_image, cu.notes, cu.created_at, cu.updated_at,
          cu.item_description, cu.sub_type, newTransferId
        ]
      );
      custodyMap[cu.id] = ins.rows[0].id;
    }
    console.log(`✅ custodies cloned: ${Object.keys(custodyMap).length}`);

    await client.query('COMMIT');
    console.log('----------------------------------------------------');
    console.log('🎉 All branch 45 data has been successfully duplicated to فرع 45 -2!');
    console.log(`Branch Name : فرع 45 -2`);
    console.log(`Branch ID   : ${newBranchId}`);
    console.log(`Username    : admin45-2`);
    console.log(`Password    : a45n2026-2`);
    console.log('----------------------------------------------------');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during clone, transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

cloneBranch().then(() => {
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
