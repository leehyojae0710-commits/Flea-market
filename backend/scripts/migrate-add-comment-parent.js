// backend/scripts/migrate-add-comment-parent.js
// [추가] 대댓글 기능을 위해 comments.parentId 컬럼을 추가합니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-comment-parent.js

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
  if (!(await columnExists('comments', 'parentId'))) {
    await pool.query(
      `ALTER TABLE comments
       ADD COLUMN parentId INT NULL COMMENT '대댓글이면 부모 댓글의 commentId, 최상위 댓글이면 NULL' AFTER content`
    );
    await pool.query(`ALTER TABLE comments ADD KEY parentId (parentId)`);
    await pool.query(
      `ALTER TABLE comments
       ADD CONSTRAINT comments_ibfk_2 FOREIGN KEY (parentId) REFERENCES comments (commentId) ON DELETE CASCADE`
    );
    console.log('✅ comments.parentId 컬럼 추가 완료');
  } else {
    console.log('➡️  comments.parentId 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});