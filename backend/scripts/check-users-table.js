// backend/scripts/check-users-table.js
import pool from '../config/db.js';

async function run() {
  try {
    const [cols] = await pool.query('DESCRIBE users');
    console.table(cols);
  } catch (error) {
    console.error('❌ 조회 실패:', error.message);
  } finally {
    process.exit();
  }
}

run();