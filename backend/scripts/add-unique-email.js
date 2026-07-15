// backend/scripts/add-unique-email.js
// email 컬럼에 UNIQUE 제약을 추가합니다. (로그인을 email 기준으로 하기 위함)
// 이미 걸려있으면 건너뜁니다. 여러 번 실행해도 안전합니다.
//
// 실행: cd backend && node scripts/add-unique-email.js

import pool from '../config/db.js';

async function run() {
  const [existing] = await pool.query(`
    SELECT COUNT(*) AS cnt
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND index_name = 'uniq_email'
  `);

  if (existing[0].cnt > 0) {
    console.log('✅ uniq_email 인덱스가 이미 있습니다. 건너뜁니다.');
    process.exit(0);
  }

  // 혹시 중복 이메일이 있으면 UNIQUE 추가가 실패하니 먼저 확인
  const [dupes] = await pool.query(`
    SELECT email, COUNT(*) AS cnt
    FROM users
    GROUP BY email
    HAVING cnt > 1
  `);

  if (dupes.length > 0) {
    console.error('❌ 중복된 이메일이 있어서 UNIQUE 제약을 추가할 수 없습니다:');
    dupes.forEach((d) => console.error(`   - ${d.email} (${d.cnt}건)`));
    console.error('먼저 중복 계정을 정리한 뒤 다시 실행해주세요.');
    process.exit(1);
  }

  await pool.query('ALTER TABLE users ADD UNIQUE KEY uniq_email (email)');
  console.log('✅ users.email에 UNIQUE 제약을 추가했습니다.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
