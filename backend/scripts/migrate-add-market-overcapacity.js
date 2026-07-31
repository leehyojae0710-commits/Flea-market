// backend/scripts/migrate-add-market-overcapacity.js
// [추가] 정원(maxparticipants)이 다 찼어도, 주최자가 원하면 행사 시작 전까지
//        초과 신청을 받을 수 있게 하는 markets.allowOvercapacity 컬럼을 추가합니다.
//
//   allowOvercapacity
//     0 (기본값) : 기존과 동일. 정원이 차면 신청이 막힙니다.
//     1          : 정원이 차도 신청/결제가 가능합니다. (판정 로직은
//                  utills/applicationPolicy.js 의 checkBoothApplyEligibility 참고 —
//                  행사 시작일(eventDate_min) 이후에는 이 값이 1이어도 다시 막습니다.)
//
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-market-overcapacity.js

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
  const [info] = await pool.query(
    'SELECT DATABASE() AS db, @@hostname AS host, VERSION() AS ver'
  );
  console.log(`▶ 대상 DB : ${info[0].db} @ ${info[0].host} (MySQL ${info[0].ver})`);
  console.log('  .env 의 DB_HOST 와 백엔드가 쓰는 DB 가 같은지 확인하세요.');
  console.log('-----------------------------------------');

  if (!(await columnExists('markets', 'allowOvercapacity'))) {
    await pool.query(
      `ALTER TABLE markets
       ADD COLUMN allowOvercapacity TINYINT(1) NOT NULL DEFAULT 0
       COMMENT '1이면 정원이 차도 행사 시작 전까지는 초과 신청/결제를 허용'
       AFTER maxparticipants`
    );
    console.log('✅ markets.allowOvercapacity 컬럼 추가 완료');
  } else {
    console.log('➡️  markets.allowOvercapacity 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
