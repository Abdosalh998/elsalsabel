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
    `).catch(() => {}); // ignore if already nullable

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
    `).catch(() => {}); // ignore if already exists

    // Make old single-product columns nullable on sales (backward compat)
    await client.query(`
      ALTER TABLE sales ALTER COLUMN inventory_id DROP NOT NULL;
      ALTER TABLE sales ALTER COLUMN quantity DROP NOT NULL;
      ALTER TABLE sales ALTER COLUMN unit_price DROP NOT NULL;
    `).catch(() => {});
    await client.query(`
      ALTER TABLE sales ALTER COLUMN quantity SET DEFAULT 0;
      ALTER TABLE sales ALTER COLUMN unit_price SET DEFAULT 0;
    `).catch(() => {});

    // Backfill old sales rows into sale_items if any exist
    await client.query(`
      INSERT INTO sale_items (sale_id, branch_id, inventory_id, quantity, unit_price, total, created_at)
      SELECT s.id, s.branch_id, s.inventory_id, COALESCE(s.quantity, 1), COALESCE(s.unit_price, s.total), s.total, s.created_at
      FROM sales s
      WHERE s.inventory_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id);
    `).catch(() => {});

    console.log('✅ Migrations completed successfully.');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = runMigrations;
