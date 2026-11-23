const pool = require('../config/db');
const runSeeds = require('./seeds/seed');

const PRESERVED_TABLES = new Set([
  'branches',
  'users',
  'payment_types',
  'schema_migrations'
]);

async function resetDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 جاري فحص الجداول في قاعدة البيانات...');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const allTables = tablesRes.rows.map(r => r.table_name);
    const tablesToTruncate = allTables.filter(t => !PRESERVED_TABLES.has(t));

    console.log(`📋 الجداول التي سيتم تصفيرها (${tablesToTruncate.length} جدول):`);
    console.log(tablesToTruncate.join(', '));

    if (tablesToTruncate.length > 0) {
      await client.query('BEGIN');
      const truncateSql = `TRUNCATE TABLE ${tablesToTruncate.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;
      await client.query(truncateSql);
      await client.query('COMMIT');
      console.log('✨ تم تصفير كافة بيانات الجداول وإعادة ترقيم الهويات (ID) بنجاح!');
    }

    console.log('🌱 جاري إعادة زرع البيانات الأساسية (Branches, Users, Payment Types)...');
    await runSeeds();

    console.log('\n📊 حالة الجداول بعد التصفير:');
    for (const t of allTables) {
      const cRes = await client.query(`SELECT COUNT(*) AS cnt FROM "${t}"`);
      console.log(` - ${t}: ${cRes.rows[0].cnt} سجل`);
    }

    console.log('\n✅ تم تصفير النظام المحلي بنجاح وجاهز للاختبار النظيف!');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ خطأ أثناء تصفير قاعدة البيانات:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase();
