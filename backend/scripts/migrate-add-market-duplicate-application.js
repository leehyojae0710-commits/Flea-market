// backend/scripts/migrate-add-market-duplicate-application.js
// [추가] 주최자가 마켓 등록/수정 시 "같은 판매자의 중복 부스 신청"을 받을지 말지
//        정할 수 있는 markets.allowDuplicateApplication 컬럼을 추가합니다.
//
//   allowDuplicateApplication
//     1 (기본값) : 기존과 동일. 한 판매자가 같은 마켓에 여러 부스를 신청할 수 있습니다.
//     0          : 한 판매자는 이 마켓에 부스를 하나만 신청할 수 있습니다. 이미 신청(대기/승인/
//                  결제완료) 중인 판매자는 같은 상품이든 다른 상품이든, 부스 번호가 같든 다르든
//                  추가로 신청할 수 없습니다. (판정 로직은 utills/applicationPolicy.js 의
//                  checkBoothApplyEligibility 참고)
//
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-market-duplicate-application.js

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

  if (!(await columnExists('markets', 'allowDuplicateApplication'))) {
    await pool.query(
      `ALTER TABLE markets
       ADD COLUMN allowDuplicateApplication TINYINT(1) NOT NULL DEFAULT 1
       COMMENT '0이면 같은 판매자가 이 마켓에 부스를 중복 신청할 수 없음 (기본값 1=허용)'
       AFTER allowOvercapacity`
    );
    console.log('✅ markets.allowDuplicateApplication 컬럼 추가 완료');
  } else {
    console.log('➡️  markets.allowDuplicateApplication 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
