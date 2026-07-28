// backend/scripts/migrate-add-review-comment.js
// [추가] market_reviews 테이블에 한줄평(comment) 컬럼을 추가합니다. (선택 입력, 최대 200자)
// 실행: cd backend && node scripts/migrate-add-review-comment.js

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
  if (!(await columnExists('market_reviews', 'comment'))) {
    await pool.query(`ALTER TABLE market_reviews ADD COLUMN comment VARCHAR(200) NULL AFTER rating`);
    console.log('✅ market_reviews.comment 컬럼 추가 완료');
  } else {
    console.log('➡️  이미 존재, 건너뜀');
  }
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});