// backend/scripts/migrate-add-application-title.js
// [추가] 부스 신청 시 "부스 이름"을 입력받기 위해 applications.title 컬럼을 추가합니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-application-title.js

import pool from '../config/db.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function run() {
  if (!(await columnExists('applications', 'title'))) {
    await pool.query('ALTER TABLE applications ADD COLUMN title VARCHAR(100) NULL');
    console.log('✅ applications.title 컬럼 추가 완료');
  } else {
    console.log('➡️  applications.title 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
