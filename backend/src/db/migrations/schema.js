const pool = require('../../config/db');

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migrations...');

    await client.query(`
      -- Branches table (multi-branch architecture)
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20) NOT NULL UNIQUE,
        address TEXT,
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Users table (role-based)
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'branch_user')),
        branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
        full_name VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Customers table
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(20),
        total_payments NUMERIC(15,2) DEFAULT 0,
        customer_total NUMERIC(15,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Customer balances table
      CREATE TABLE IF NOT EXISTS customer_balances (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        invoice_amount NUMERIC(15,2) DEFAULT 0,
        paid_amount NUMERIC(15,2) DEFAULT 0,
        remaining_balance NUMERIC(15,2) DEFAULT 0,
        customer_credit NUMERIC(15,2) DEFAULT 0,
        source_type VARCHAR(30) DEFAULT 'manual',
        source_id INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Inventory table
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        company VARCHAR(150),
        product VARCHAR(150) NOT NULL,
        weight_quantity NUMERIC(15,3) DEFAULT 0,
        count INTEGER DEFAULT 0,
        roll_price NUMERIC(15,2) DEFAULT 0,
        issued_quantity NUMERIC(15,3) DEFAULT 0,
        available_quantity NUMERIC(15,3) GENERATED ALWAYS AS (weight_quantity - issued_quantity) STORED,
        total NUMERIC(15,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Payment types table (user-extensible)
      CREATE TABLE IF NOT EXISTS payment_types (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name VARCHAR(50) NOT NULL,
        is_system BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Treasury table
      CREATE TABLE IF NOT EXISTS treasury (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        payment_type_id INTEGER REFERENCES payment_types(id) ON DELETE RESTRICT,
        amount NUMERIC(15,2) NOT NULL,
        treasury_balance NUMERIC(15,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Expenses table
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount NUMERIC(15,2) NOT NULL,
        treasury_balance_before NUMERIC(15,2) DEFAULT 0,
        treasury_balance_after NUMERIC(15,2) DEFAULT 0,
        notes TEXT,
        override_reason TEXT,
        payment_type_id INTEGER REFERENCES payment_types(id) ON DELETE SET NULL,
        channel VARCHAR(30) DEFAULT 'cash',
        recipient_name VARCHAR(255),
        items JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Sales invoices table
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        invoice_number INTEGER NOT NULL,
        date DATE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
        quantity NUMERIC(15,3) NOT NULL,
        unit_price NUMERIC(15,2) NOT NULL,
        total NUMERIC(15,2) NOT NULL,
        paid_amount NUMERIC(15,2) DEFAULT 0,
        remaining_balance NUMERIC(15,2) DEFAULT 0,
        customer_credit NUMERIC(15,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(branch_id, invoice_number)
      );

      -- Purchases table
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
        product VARCHAR(150),
        quantity NUMERIC(15,3) DEFAULT 0,
        discount NUMERIC(15,2) DEFAULT 0,
        quantity_after_discount NUMERIC(15,3) DEFAULT 0,
        total NUMERIC(15,2) NOT NULL,
        treasury_balance NUMERIC(15,2) DEFAULT 0,
        notes TEXT,
        credit_used NUMERIC(15,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Fix existing DB: make customer_id nullable if it was NOT NULL
    await client.query(`
      ALTER TABLE purchases ALTER COLUMN customer_id DROP NOT NULL;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS transferred_to_inventory BOOLEAN DEFAULT false;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL;
    `).catch(() => { }); // ignore if already nullable

    // Add sale_items table for multi-item invoice support
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
        quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
        unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
        total NUMERIC(15,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { }); // ignore if already exists

    // Make old single-product columns nullable on sales (backward compat)
    await client.query(`
      ALTER TABLE sales ALTER COLUMN inventory_id DROP NOT NULL;
      ALTER TABLE sales ALTER COLUMN quantity DROP NOT NULL;
      ALTER TABLE sales ALTER COLUMN unit_price DROP NOT NULL;
    `).catch(() => { });
    await client.query(`
      ALTER TABLE sales ALTER COLUMN quantity SET DEFAULT 0;
      ALTER TABLE sales ALTER COLUMN unit_price SET DEFAULT 0;
    `).catch(() => { });

    // Backfill old sales rows into sale_items if any exist
    await client.query(`
      INSERT INTO sale_items (sale_id, branch_id, inventory_id, quantity, unit_price, total, created_at)
      SELECT s.id, s.branch_id, s.inventory_id, COALESCE(s.quantity, 1), COALESCE(s.unit_price, s.total), s.total, s.created_at
      FROM sales s
      WHERE s.inventory_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id);
    `).catch(() => { });

    // Phase 1: Inventory improvements (image, price_per_kg, weight tracking)
    await client.query(`
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price_per_kg NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE inventory ALTER COLUMN roll_price DROP NOT NULL;
      ALTER TABLE inventory ALTER COLUMN count DROP NOT NULL;
    `).catch(() => { });

    // Phase 1: Payment Channels (cash, wallet, instapay)
    await client.query(`
      ALTER TABLE payment_types ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'cash';
      
      UPDATE payment_types SET channel = 'cash' WHERE name ILIKE '%كاش%' OR name ILIKE '%نقدي%' OR name ILIKE '%cash%';
      UPDATE payment_types SET channel = 'instapay' WHERE name ILIKE '%انستا%' OR name ILIKE '%insta%';
      UPDATE payment_types SET channel = 'wallet' WHERE name ILIKE '%محفظ%' OR name ILIKE '%فودافون%' OR name ILIKE '%wallet%';

      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_type_id INTEGER REFERENCES payment_types(id) ON DELETE SET NULL;
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'cash';

      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_type_id INTEGER REFERENCES payment_types(id) ON DELETE SET NULL;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'cash';

      ALTER TABLE treasury ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'cash';
      UPDATE treasury t SET channel = COALESCE(pt.channel, 'cash') FROM payment_types pt WHERE t.payment_type_id = pt.id AND (t.channel IS NULL OR t.channel = 'cash');

      -- Deduplicate payment_types safely
      UPDATE treasury t
      SET payment_type_id = min_pt.min_id
      FROM (
        SELECT name, branch_id, MIN(id) as min_id
        FROM payment_types
        GROUP BY name, branch_id
      ) min_pt
      JOIN payment_types pt ON pt.name = min_pt.name AND pt.branch_id = min_pt.branch_id
      WHERE t.payment_type_id = pt.id AND t.payment_type_id != min_pt.min_id;

      DELETE FROM payment_types pt1
      USING payment_types pt2
      WHERE pt1.branch_id = pt2.branch_id 
        AND pt1.name = pt2.name 
        AND pt1.id > pt2.id;

      ALTER TABLE payment_types DROP CONSTRAINT IF EXISTS payment_types_branch_name_key;
      ALTER TABLE payment_types ADD CONSTRAINT payment_types_branch_name_key UNIQUE (branch_id, name);

      -- Weight-based sales & inventory roll tracking
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS issued_rolls INTEGER DEFAULT 0;
      ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS weight NUMERIC(15,3) DEFAULT 0;
      ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS rolls_count INTEGER DEFAULT 0;
      ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS price NUMERIC(15,2) DEFAULT 0;
      UPDATE sale_items SET weight = quantity, price = unit_price WHERE weight = 0 AND quantity > 0;

      -- Inter-Branch Transfers table
      CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY,
        transfer_number VARCHAR(50) NOT NULL UNIQUE,
        from_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        to_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        type VARCHAR(30) NOT NULL CHECK (type IN ('monetary', 'inventory')),
        status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected', 'cancelled')),
        amount NUMERIC(15,2) DEFAULT 0,
        channel VARCHAR(30) DEFAULT 'cash',
        notes TEXT,
        rejection_reason TEXT,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        received_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Transfer items table (for inventory/material transfers)
      CREATE TABLE IF NOT EXISTS transfer_items (
        id SERIAL PRIMARY KEY,
        transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
        product VARCHAR(150) NOT NULL,
        company VARCHAR(150) NOT NULL,
        weight NUMERIC(15,3) NOT NULL DEFAULT 0,
        rolls_count INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_transfers_from_branch ON transfers(from_branch_id);
      CREATE INDEX IF NOT EXISTS idx_transfers_to_branch ON transfers(to_branch_id);
      CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
    `).catch(() => { });

    // Phase 2: Unified Store - add inventory fields to purchases table
    await client.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS company VARCHAR(150) DEFAULT '';
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS weight_quantity NUMERIC(15,3) DEFAULT 0;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS count INTEGER DEFAULT 0;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS roll_price NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS price_per_kg NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS price_per_ton NUMERIC(15,2) DEFAULT 0;
    `).catch(() => { });

    // Phase 3: Sales Returns Module
    await client.query(`
      CREATE TABLE IF NOT EXISTS returns (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
        date DATE NOT NULL,
        product VARCHAR(150) NOT NULL,
        company VARCHAR(150) DEFAULT '',
        weight NUMERIC(15,3) NOT NULL DEFAULT 0,
        price_per_ton NUMERIC(15,2) NOT NULL DEFAULT 0,
        total NUMERIC(15,2) NOT NULL DEFAULT 0,
        notes TEXT,
        add_to_balance BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_returns_branch ON returns(branch_id);
      CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);
      CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id);
      CREATE INDEX IF NOT EXISTS idx_returns_date ON returns(date);

      ALTER TABLE sales ADD COLUMN IF NOT EXISTS returns_total NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS gross_total NUMERIC(15,2) DEFAULT 0;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS rolls_count INTEGER DEFAULT 0;
      ALTER TABLE returns ADD COLUMN IF NOT EXISTS count INTEGER DEFAULT 0;
    `).catch((e) => { console.error('Error creating returns table:', e); });

    // Phase 4: Bank Deposit Channel & Receipt Images
    await client.query(`
      -- Add bank channel payment type for all branches
      INSERT INTO payment_types (branch_id, name, channel, is_system)
      SELECT id, 'إيداع بنكي', 'bank', true FROM branches
      ON CONFLICT (branch_id, name) DO UPDATE SET channel = 'bank', is_system = true;

      -- Update existing instapay channel records to ensure correct channel name
      UPDATE payment_types SET channel = 'bank' WHERE name ILIKE '%بنك%' OR name ILIKE '%bank%' OR name ILIKE '%إيداع بنكي%';

      -- Add receipt_image column to treasury
      ALTER TABLE treasury ADD COLUMN IF NOT EXISTS receipt_image TEXT;

      -- Add receipt_image column to expenses
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_image TEXT;

      -- Add receipt_image column to purchases
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS receipt_image TEXT;

      -- Add scale_ticket_image column to purchases & inventory (كارتة الميزان)
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS scale_ticket_image TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS scale_ticket_image TEXT;

      -- Add receipt_image column to sales
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS receipt_image TEXT;
    `).catch((e) => { console.error('Phase 4 migration error:', e.message); });

    // Phase 5: Separate Purchases from Inventory + material_type + image_url
    await client.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS material_type VARCHAR(30) DEFAULT 'section';
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS image_url TEXT;
    `).catch((e) => { console.error('Phase 5 migration error:', e.message); });

    // Phase 6: Coloring Orders Module (التلوين)
    await client.query(`
      CREATE TABLE IF NOT EXISTS coloring_orders (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        order_number VARCHAR(50),
        product VARCHAR(200) NOT NULL,
        inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
        issued_weight NUMERIC(15,3) DEFAULT 0,
        issued_rolls INTEGER DEFAULT 0,
        returned_weight NUMERIC(15,3) DEFAULT 0,
        returned_rolls INTEGER DEFAULT 0,
        weight_gain NUMERIC(15,3) DEFAULT 0,
        color VARCHAR(100) DEFAULT '',
        colored_product VARCHAR(200) DEFAULT '',
        coloring_cost NUMERIC(15,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        result_inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
        notes TEXT DEFAULT '',
        image_url TEXT,
        scale_ticket_image TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_coloring_orders_branch ON coloring_orders(branch_id);
      CREATE INDEX IF NOT EXISTS idx_coloring_orders_date ON coloring_orders(date);
      CREATE INDEX IF NOT EXISTS idx_coloring_orders_status ON coloring_orders(status);

      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS issued_to_coloring NUMERIC(15,3) DEFAULT 0;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS issued_rolls_coloring INTEGER DEFAULT 0;
      ALTER TABLE coloring_orders ADD COLUMN IF NOT EXISTS payment_type_id INTEGER REFERENCES payment_types(id) ON DELETE SET NULL;
      ALTER TABLE coloring_orders ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'cash';
      ALTER TABLE coloring_orders ADD COLUMN IF NOT EXISTS expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL;
      ALTER TABLE coloring_orders ADD COLUMN IF NOT EXISTS coloring_company VARCHAR(200) DEFAULT '';
    `).catch((e) => { console.error('Phase 6 migration error:', e.message); });

    // Phase 7: Custody Module (العهد)
    await client.query(`
      CREATE TABLE IF NOT EXISTS custodies (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        person_name VARCHAR(150) NOT NULL,
        phone VARCHAR(20) DEFAULT '',
        type VARCHAR(20) NOT NULL CHECK (type IN ('disbursement', 'collection')),
        amount NUMERIC(15,2) NOT NULL DEFAULT 0,
        payment_type_id INTEGER REFERENCES payment_types(id) ON DELETE SET NULL,
        channel VARCHAR(30) DEFAULT 'cash',
        receipt_number VARCHAR(50),
        receipt_image TEXT,
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_custodies_branch ON custodies(branch_id);
      CREATE INDEX IF NOT EXISTS idx_custodies_person ON custodies(branch_id, LOWER(TRIM(person_name)));
      CREATE INDEX IF NOT EXISTS idx_custodies_date ON custodies(date);
      CREATE INDEX IF NOT EXISTS idx_custodies_type ON custodies(type);
    `).catch((e) => { console.error('Phase 7 migration error:', e.message); });

    // Phase 8: Permanent Supply Log (سجل التوريدات)
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
    `).catch((e) => { console.error('Phase 8 migration error:', e.message); });

    // Phase 9: New Features (تحويل القنوات، تحويلات العهد، تسويات أرصدة العملاء)
    await client.query(`
      ALTER TABLE custodies ADD COLUMN IF NOT EXISTS item_description TEXT DEFAULT NULL;
      ALTER TABLE custodies ADD COLUMN IF NOT EXISTS sub_type VARCHAR(30) DEFAULT NULL;

      CREATE TABLE IF NOT EXISTS custody_transfers (
        id              SERIAL PRIMARY KEY,
        branch_id       INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date            DATE NOT NULL DEFAULT CURRENT_DATE,
        from_person     VARCHAR(200) NOT NULL,
        to_person       VARCHAR(200) NOT NULL,
        amount          NUMERIC(15, 2) NOT NULL,
        receipt_number  VARCHAR(60),
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_custody_transfers_branch ON custody_transfers(branch_id);
      CREATE INDEX IF NOT EXISTS idx_custody_transfers_from ON custody_transfers(branch_id, LOWER(TRIM(from_person)));
      CREATE INDEX IF NOT EXISTS idx_custody_transfers_to ON custody_transfers(branch_id, LOWER(TRIM(to_person)));

      CREATE TABLE IF NOT EXISTS treasury_channel_transfers (
        id            SERIAL PRIMARY KEY,
        branch_id     INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        date          DATE NOT NULL DEFAULT CURRENT_DATE,
        from_channel  VARCHAR(20) NOT NULL,
        to_channel    VARCHAR(20) NOT NULL,
        amount        NUMERIC(15, 2) NOT NULL,
        notes         TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_treasury_ch_transfers_branch ON treasury_channel_transfers(branch_id);

      CREATE TABLE IF NOT EXISTS customer_balance_adjustments (
        id          SERIAL PRIMARY KEY,
        branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        date        DATE NOT NULL DEFAULT CURRENT_DATE,
        type        VARCHAR(20) NOT NULL,
        amount      NUMERIC(15, 2) NOT NULL,
        reason      TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_cust_bal_adj_customer ON customer_balance_adjustments(customer_id);

      -- Phase 10: Sales Settlement (تسوية الفواتير)
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(15,2) DEFAULT 0;

      -- Phase 11: Coloring Stock Synchronization (ربط التلوين الفوري بالمخزون وفرق الوزن)
      ALTER TABLE coloring_orders ADD COLUMN IF NOT EXISTS initial_stocked BOOLEAN DEFAULT FALSE;
      ALTER TABLE coloring_orders ADD COLUMN IF NOT EXISTS gain_stocked BOOLEAN DEFAULT FALSE;
      ALTER TABLE coloring_orders ADD COLUMN IF NOT EXISTS stocked_weight NUMERIC(15,3) DEFAULT 0;
      ALTER TABLE coloring_orders ADD COLUMN IF NOT EXISTS stocked_rolls INTEGER DEFAULT 0;
    `).catch((e) => { console.error('Phase 9 migration error:', e.message); });

    console.log('✅ Migrations completed successfully.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
