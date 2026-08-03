// backend/scripts/migrate-add-market-options.js
// [통합 마이그레이션] 주최자 마켓 옵션 두 개를 한 번에 추가합니다.
//
//   markets.allowOvercapacity          TINYINT(1) NOT NULL DEFAULT 0
//     0 : 정원(maxparticipants)이 차면 신청이 막힘 (기존 동작)
//     1 : 정원이 차도 행사 시작일(eventDate_min) 전까지는 신청/승인/결제 가능
//
//   markets.allowDuplicateApplication  TINYINT(1) NOT NULL DEFAULT 1
//     1 : 한 판매자가 같은 마켓에 부스를 여러 개 신청 가능 (기존 동작, 1인 다부스 정책)
//     0 : 한 판매자는 이 마켓에 부스를 하나만 신청 가능
//
// 왜 통합본을 따로 뒀나
//   기존 migrate-add-market-duplicate-application.js 는 "AFTER allowOvercapacity" 로
//   컬럼 위치를 잡습니다. overcapacity 를 먼저 안 돌리면 그 자체가 실패했습니다.
//   이 스크립트는 순서를 보장하고, 둘 중 뭐가 있고 없는지도 같이 출력합니다.
//
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀). 기존 데이터는 건드리지 않습니다.
//
// 실행: cd backend && node scripts/migrate-add-market-options.js

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
  console.log('  .env 의 DB_HOST / DB_NAME 이 백엔드가 쓰는 DB 와 같은지 확인하세요.');
  console.log('-----------------------------------------');

  // 1) allowOvercapacity — maxparticipants 뒤에 붙입니다.
  if (!(await columnExists('markets', 'allowOvercapacity'))) {
    const after = (await columnExists('markets', 'maxparticipants')) ? ' AFTER maxparticipants' : '';
    await pool.query(
      `ALTER TABLE markets
       ADD COLUMN allowOvercapacity TINYINT(1) NOT NULL DEFAULT 0
       COMMENT '1이면 정원이 차도 행사 시작 전까지는 초과 신청/결제를 허용'${after}`
    );
    console.log('✅ markets.allowOvercapacity 추가 완료 (기본값 0 = 초과 신청 불가)');
  } else {
    console.log('➡️  markets.allowOvercapacity 이미 존재, 건너뜀');
  }

  // 2) allowDuplicateApplication — allowOvercapacity 뒤에 붙입니다.
  if (!(await columnExists('markets', 'allowDuplicateApplication'))) {
    await pool.query(
      `ALTER TABLE markets
       ADD COLUMN allowDuplicateApplication TINYINT(1) NOT NULL DEFAULT 1
       COMMENT '0이면 같은 판매자가 이 마켓에 부스를 중복 신청할 수 없음 (기본값 1=허용)'
       AFTER allowOvercapacity`
    );
    console.log('✅ markets.allowDuplicateApplication 추가 완료 (기본값 1 = 중복 신청 허용)');
  } else {
    console.log('➡️  markets.allowDuplicateApplication 이미 존재, 건너뜀');
  }

  // 3) 결과 확인
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME AS name, COLUMN_DEFAULT AS def, COLUMN_TYPE AS type
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'markets'
        AND column_name IN ('allowOvercapacity', 'allowDuplicateApplication')
      ORDER BY ORDINAL_POSITION`
  );
  console.log('-----------------------------------------');
  console.log('현재 상태:');
  for (const c of cols) console.log(`  - ${c.name} ${c.type} DEFAULT ${c.def}`);

  const [[stat]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(allowOvercapacity = 1) AS over1,
            SUM(allowDuplicateApplication = 0) AS dup0
       FROM markets`
  );
  console.log(`  - 마켓 ${stat.total}건 중 초과 신청 허용 ${stat.over1 || 0}건 / 중복 신청 차단 ${stat.dup0 || 0}건`);
  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 백엔드는 최대 60초 안에 자동으로 인식합니다.');
  console.log('(바로 반영하려면 서버를 재시작하세요.)');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
