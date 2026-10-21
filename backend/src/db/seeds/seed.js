const bcrypt = require('bcryptjs');
const pool = require('../../config/db');

async function runSeeds() {
  const client = await pool.connect();
  try {
    console.log('🌱 Running seeds...');

    // Seed Branch 45
    const branchResult = await client.query(`
      INSERT INTO branches (name, code, address, phone)
      VALUES ('فرع 45', 'BRANCH_45', NULL, NULL)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const branch45Id = branchResult.rows[0].id;

    // Seed Admin user (no branch)
    const adminHash = await bcrypt.hash('hamdo2026', 12);
    await client.query(`
      INSERT INTO users (username, password_hash, role, branch_id, full_name)
      VALUES ('samh', $1, 'admin', NULL, 'المدير العام')
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `, [adminHash]);

    // Seed Branch 45 user
    const branch45Hash = await bcrypt.hash('a45n2026', 12);
    await client.query(`
      INSERT INTO users (username, password_hash, role, branch_id, full_name)
      VALUES ('admin45', $1, 'branch_user', $2, 'مسؤول فرع 45')
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `, [branch45Hash, branch45Id]);

    // Seed default payment types for Branch 45
    const paymentTypes = ['كاش', 'انستاباي', 'فودافون كاش', 'مشتريات'];
    for (const typeName of paymentTypes) {
      await client.query(`
        INSERT INTO payment_types (branch_id, name, is_system)
        VALUES ($1, $2, true)
        ON CONFLICT DO NOTHING;
      `, [branch45Id, typeName]);
    }

    console.log(`✅ Seeds completed. Branch 45 ID: ${branch45Id}`);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = runSeeds;
