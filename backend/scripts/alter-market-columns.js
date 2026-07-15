// backend/scripts/alter-market-columns.js
import pool from '../config/db.js';

async function run() {
  try {
    await pool.query(`
      ALTER TABLE markets
        ADD COLUMN region VARCHAR(50) DEFAULT NULL AFTER locationName,
        ADD COLUMN category VARCHAR(30) DEFAULT NULL AFTER region,
        ADD COLUMN boothPrice INT NOT NULL DEFAULT 0 AFTER category
    `);
    console.log('✅ markets 테이블에 region, category, boothPrice 컬럼 추가 완료!');

    const [cols] = await pool.query('DESCRIBE markets');
    console.table(cols);
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error.message);
  } finally {
    process.exit();
  }
}

run();