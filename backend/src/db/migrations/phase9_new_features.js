const pool = require('../../config/db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add columns to custodies
    await client.query(`ALTER TABLE custodies ADD COLUMN IF NOT EXISTS item_description TEXT DEFAULT NULL`);
    await client.query(`ALTER TABLE custodies ADD COLUMN IF NOT EXISTS sub_type VARCHAR(30) DEFAULT NULL`);
    
    console.log('step1 done');

    // 2. custody_transfers
    await client.query(`
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
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_custody_transfers_branch ON custody_transfers(branch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_custody_transfers_from ON custody_transfers(branch_id, LOWER(TRIM(from_person)))`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_custody_transfers_to ON custody_transfers(branch_id, LOWER(TRIM(to_person)))`);

    console.log('step2 done');

    // 3. treasury_channel_transfers
    await client.query(`
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
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_treasury_ch_transfers_branch ON treasury_channel_transfers(branch_id)`);

    console.log('step3 done');

    // 4. customer_balance_adjustments
    await client.query(`
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
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cust_bal_adj_customer ON customer_balance_adjustments(customer_id)`);

    console.log('step4 done');

    await client.query('COMMIT');
    console.log('Migration OK');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration FAILED:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
