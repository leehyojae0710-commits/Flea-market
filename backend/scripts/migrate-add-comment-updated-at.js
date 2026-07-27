// backend/scripts/migrate-add-comment-updated-at.js
// [추가] 댓글 수정 기능을 위해 comments.updatedAt 컬럼을 추가합니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-comment-updated-at.js

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
  if (!(await columnExists('comments', 'updatedAt'))) {
    await pool.query(
      `ALTER TABLE comments
       ADD COLUMN updatedAt TIMESTAMP NULL DEFAULT NULL COMMENT '수정된 적이 있으면 마지막 수정 시각, 없으면 NULL' AFTER createdAt`
    );
    console.log('✅ comments.updatedAt 컬럼 추가 완료');
  } else {
    console.log('➡️  comments.updatedAt 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
