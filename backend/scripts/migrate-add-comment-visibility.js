// backend/scripts/migrate-add-comment-visibility.js
// [추가] 댓글 비공개(주최자 전용 / 판매자 전용) 기능을 위해
//        comments.visibility, comments.counterpartId 컬럼을 추가합니다.
//
//   visibility
//     'public'      : 모두 공개 (기본값, 기존 댓글 전부 여기에 해당)
//     'host_only'   : 판매자가 작성 -> 작성자 + 주최자만 열람  ("주최자만 볼 수 있는 댓글입니다.")
//     'seller_only' : 주최자가 작성 -> 작성자(주최자) + counterpartId 판매자만 열람
//                     ("판매자만 볼 수 있는 댓글입니다.")
//
//   counterpartId
//     visibility='seller_only' 일 때 "이 댓글을 볼 수 있는 판매자"의 userId.
//     그 외에는 NULL. (host_only 는 주최자를 markets.hostId 로 찾으므로 저장 불필요)
//
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-comment-visibility.js

import pool from '../config/db.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  );
  return rows[0].cnt > 0;
}

async function run() {
  // 0) 어느 DB 에 붙었는지 먼저 표시합니다.
  //    (로컬 DB 에 마이그레이션하고 서버는 팀 DB 를 보는 실수가 잦습니다)
  const [info] = await pool.query(
    'SELECT DATABASE() AS db, @@hostname AS host, VERSION() AS ver'
  );
  console.log(`▶ 대상 DB : ${info[0].db} @ ${info[0].host} (MySQL ${info[0].ver})`);
  console.log('  .env 의 DB_HOST 와 백엔드가 쓰는 DB 가 같은지 확인하세요.');
  console.log('-----------------------------------------');

  // 1) visibility 컬럼
  if (!(await columnExists('comments', 'visibility'))) {
    await pool.query(
      `ALTER TABLE comments
       ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'public'
       COMMENT 'public | host_only(주최자만 열람) | seller_only(지정 판매자만 열람)'
       AFTER content`
    );
    console.log('✅ comments.visibility 컬럼 추가 완료');
  } else {
    console.log('➡️  comments.visibility 이미 존재, 건너뜀');
  }

  // 2) counterpartId 컬럼
  if (!(await columnExists('comments', 'counterpartId'))) {
    await pool.query(
      `ALTER TABLE comments
       ADD COLUMN counterpartId BIGINT UNSIGNED NULL
       COMMENT 'seller_only 일 때 열람 가능한 판매자 userId'
       AFTER visibility`
    );
    console.log('✅ comments.counterpartId 컬럼 추가 완료');
  } else {
    console.log('➡️  comments.counterpartId 이미 존재, 건너뜀');
  }

  // 3) 조회 성능용 인덱스 (대상 + 공개범위)
  if (!(await indexExists('comments', 'idx_comments_visibility'))) {
    await pool.query(
      `ALTER TABLE comments ADD KEY idx_comments_visibility (targetType, targetId, visibility)`
    );
    console.log('✅ comments.idx_comments_visibility 인덱스 추가 완료');
  } else {
    console.log('➡️  comments.idx_comments_visibility 이미 존재, 건너뜀');
  }

  // 4) 기존 데이터 백필 (NULL 방어)
  const [upd] = await pool.query(
    `UPDATE comments SET visibility = 'public' WHERE visibility IS NULL OR visibility = ''`
  );
  console.log(`✅ 기존 댓글 ${upd.affectedRows}건 visibility='public' 백필 완료`);

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
