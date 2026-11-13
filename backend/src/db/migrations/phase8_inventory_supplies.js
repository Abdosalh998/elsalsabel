const pool = require('../../config/db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_supplies (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        company VARCHAR(150),
        product VARCHAR(150) NOT NULL,
        weight_quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
        count INTEGER NOT NULL DEFAULT 0,
        price_per_kg NUMERIC(15,2) DEFAULT 0,
        roll_price NUMERIC(15,2) DEFAULT 0,
        total NUMERIC(15,2) DEFAULT 0,
        supplier_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
        scale_ticket_image TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_supplies_branch ON inventory_supplies(branch_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_supplies_date ON inventory_supplies(date);
      CREATE INDEX IF NOT EXISTS idx_inventory_supplies_company ON inventory_supplies(branch_id, LOWER(TRIM(company)));
      CREATE INDEX IF NOT EXISTS idx_inventory_supplies_product ON inventory_supplies(branch_id, LOWER(TRIM(product)));
    `);

    // Backfill from purchases that were transferred to inventory if any
    await client.query(`
      INSERT INTO inventory_supplies (branch_id, date, company, product, weight_quantity, count, price_per_kg, roll_price, total, supplier_id, purchase_id, scale_ticket_image, notes, created_at)
      SELECT 
        p.branch_id,
        p.date,
        COALESCE(p.company, c.name, ''),
        p.product,
        COALESCE(p.quantity, 0),
        COALESCE(p.count, 0),
        COALESCE(p.price_per_kg, 0),
        COALESCE(p.roll_price, 0),
        COALESCE(p.total, 0),
        p.customer_id,
        p.id,
        p.scale_ticket_image,
        COALESCE(p.notes, 'وارد من فاتورة مشتريات'),
        p.created_at
      FROM purchases p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.transferred_to_inventory = true
        AND NOT EXISTS (SELECT 1 FROM inventory_supplies s WHERE s.purchase_id = p.id)
    `);

    // Also populate initial supply records from existing inventory if inventory_supplies is empty
    const checkSupplies = await client.query('SELECT COUNT(*) FROM inventory_supplies');
    if (parseInt(checkSupplies.rows[0].count, 10) === 0) {
      // Create initial supply records from current inventory rows
      await client.query(`
        INSERT INTO inventory_supplies (branch_id, date, company, product, weight_quantity, count, price_per_kg, roll_price, total, scale_ticket_image, notes, created_at)
        SELECT 
          branch_id, date, company, product, weight_quantity, count, price_per_kg, roll_price, total, scale_ticket_image, COALESCE(notes, 'رصيد مخزون تأسيسي'), created_at
        FROM inventory
      `);
    }

    // Now let's handle the existing "المتحده - المصريه" record (id: 17)
    // Check if row 17 exists with company "المتحده - المصريه"
    const row17Res = await client.query(`SELECT * FROM inventory WHERE id = 17 AND company ILIKE '%المتحده%المصريه%'`);
    if (row17Res.rows.length > 0) {
      const r = row17Res.rows[0];
      // Update row 17 to be 'المصريه' with 1000 kg and 100 rolls
      // And issued: 350 kg and 35 rolls (remaining 650 kg)
      await client.query(`
        UPDATE inventory 
        SET company = 'المصريه',
            weight_quantity = 1000.000,
            count = 100,
            issued_quantity = 350.000,
            issued_rolls = 35,
            notes = 'تم فصله عن المتحدة'
        WHERE id = 17
      `);

      // Insert new row for 'المتحده' with 1050 kg and 105 rolls (issued 0)
      const checkMottaheda = await client.query(`SELECT id FROM inventory WHERE branch_id = $1 AND LOWER(TRIM(product)) = 'قطاع فضي' AND company = 'المتحده'`, [r.branch_id]);
      if (checkMottaheda.rows.length === 0) {
        await client.query(`
          INSERT INTO inventory (branch_id, date, company, product, weight_quantity, count, roll_price, price_per_kg, total, notes, issued_quantity, issued_rolls)
          VALUES ($1, $2, 'المتحده', 'قطاع فضي', 1050.000, 105, $3, $4, 0, 'تم فصله عن المصرية', 0, 0)
        `, [r.branch_id, r.date, r.roll_price, r.price_per_kg]);
      }

      // Also ensure inventory_supplies has the two distinct supply records for auditing
      await client.query(`DELETE FROM inventory_supplies WHERE company ILIKE '%المتحده%المصريه%'`);
      await client.query(`
        INSERT INTO inventory_supplies (branch_id, date, company, product, weight_quantity, count, price_per_kg, roll_price, total, notes)
        VALUES 
          ($1, $2, 'المصريه', 'قطاع فضي', 1000.000, 100, 0, 0, 0, 'توريدة قطاع فضي - المصريه'),
          ($1, $2, 'المتحده', 'قطاع فضي', 1050.000, 105, 0, 0, 0, 'توريدة قطاع فضي - المتحده')
      `, [r.branch_id, r.date]);
    }

    await client.query('COMMIT');
    console.log('✅ Phase 8 Migration (inventory_supplies & company split) completed successfully!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Phase 8 Migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
}

migrate().then(() => process.exit(0)).catch(() => process.exit(1));

