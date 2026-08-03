// backend/scripts/migrate-add-booth-types.js
// [부스 종류] 주최자가 마켓마다 최대 3개까지 부스 종류(이름 + 가격)를 만들 수 있게 합니다.
//
//   market_booth_types      마켓별 부스 종류 (스탠다드 30,000원 / 프리미엄 50,000원 …)
//   applications.boothTypeId  판매자가 신청할 때 고른 부스 종류
//
// 가격 결정 규칙
//   신청에 boothTypeId 가 있으면 그 종류의 가격, 없으면 기존처럼 markets.boothPrice.
//   즉 이 마이그레이션을 돌려도 기존 마켓·기존 신청은 하나도 안 바뀝니다.
//
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀). 기존 데이터는 건드리지 않습니다.
//
// 실행: cd backend && node scripts/migrate-add-booth-types.js

import pool from '../config/db.js';

async function tableExists(table) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return row.cnt > 0;
}

async function columnExists(table, column) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return row.cnt > 0;
}

async function run() {
  const [info] = await pool.query(
    'SELECT DATABASE() AS db, @@hostname AS host, VERSION() AS ver'
  );
  console.log(`▶ 대상 DB : ${info[0].db} @ ${info[0].host} (MySQL ${info[0].ver})`);
  console.log('  .env 의 DB_HOST / DB_NAME 이 백엔드가 쓰는 DB 와 같은지 확인하세요.');
  console.log('-----------------------------------------');

  // 1) 부스 종류 테이블
  //    CHARSET/COLLATE 를 지정하지 않고 DB 기본값을 따릅니다.
  //    utf8mb4_0900_ai_ci 를 못 박으면 MySQL 8 이 아닌 환경(MariaDB 등)에서
  //    "Unknown collation" 으로 마이그레이션이 통째로 실패합니다.
  //    기존 테이블과 같은 기본값을 쓰므로 조인 시 collation 충돌도 없습니다.
  if (!(await tableExists('market_booth_types'))) {
    await pool.query(`
      CREATE TABLE market_booth_types (
        boothTypeId INT NOT NULL AUTO_INCREMENT,
        marketId    INT NOT NULL,
        name        VARCHAR(30) NOT NULL COMMENT '부스 종류 이름 (예: 스탠다드, 프리미엄)',
        price       INT NOT NULL DEFAULT 0 COMMENT '이 종류의 부스료(원)',
        sortOrder   TINYINT NOT NULL DEFAULT 0 COMMENT '화면 표시 순서 (0부터)',
        isActive    TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0이면 신규 신청에서 숨김 (기존 신청의 가격 계산에는 계속 사용)',
        createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (boothTypeId),
        KEY idx_booth_type_market (marketId, sortOrder),
        CONSTRAINT fk_booth_type_market FOREIGN KEY (marketId)
          REFERENCES markets (marketId) ON DELETE CASCADE
      ) ENGINE=InnoDB
        COMMENT='마켓별 부스 종류 (마켓당 최대 3개)'
    `);
    console.log('✅ market_booth_types 테이블 생성 완료');
  } else {
    console.log('➡️  market_booth_types 이미 존재, 건너뜀');
  }

  // 2) 신청에 선택한 종류 저장 — FK 는 걸지 않습니다.
  //    종류가 지워져도 신청이 같이 지워지면 안 되고, 값이 비면 마켓 기본가로 자연스럽게 폴백되기 때문입니다.
  if (!(await columnExists('applications', 'boothTypeId'))) {
    const after = (await columnExists('applications', 'boothNumber')) ? ' AFTER boothNumber' : '';
    await pool.query(
      `ALTER TABLE applications
       ADD COLUMN boothTypeId INT NULL
       COMMENT '판매자가 고른 부스 종류 (NULL 이면 markets.boothPrice 적용)'${after}`
    );
    console.log('✅ applications.boothTypeId 컬럼 추가 완료');
  } else {
    console.log('➡️  applications.boothTypeId 이미 존재, 건너뜀');
  }

  // 2-1) 부스 종류별 정원
  //    총 정원(markets.maxParticipants)만 있으면 A만 다 차고 C는 비어 있어도 막을 수 없습니다.
  //    자리 크기·위치가 다르면 종류마다 실제 칸 수가 정해져 있으므로 종류별로 제한합니다.
  //    0 = 이 종류만 제한 없음 (총 정원 규칙은 그대로 적용)
  if (!(await columnExists('market_booth_types', 'capacity'))) {
    await pool.query(
      `ALTER TABLE market_booth_types
       ADD COLUMN capacity INT NOT NULL DEFAULT 0
       COMMENT '이 종류의 최대 부스 수 (0 = 제한 없음)'
       AFTER price`
    );
    console.log('✅ market_booth_types.capacity 컬럼 추가 완료 (기본값 0 = 제한 없음)');
  } else {
    console.log('➡️  market_booth_types.capacity 이미 존재, 건너뜀');
  }

  // 3) 승인 시점 금액 고정
  //    주최자가 승인한 뒤 부스 가격을 바꿔도, 이미 승인된 판매자가 낼 금액은 안 바뀌어야 합니다.
  //    승인되는 순간의 금액을 여기에 박아두고, 조회·결제는 이 값을 최우선으로 씁니다.
  //    NULL = 아직 승인 전(현재가를 따라감).
  if (!(await columnExists('applications', 'approvedPrice'))) {
    const after2 = (await columnExists('applications', 'boothTypeId')) ? ' AFTER boothTypeId' : '';
    await pool.query(
      `ALTER TABLE applications
       ADD COLUMN approvedPrice INT NULL
       COMMENT '주최자 승인 시점에 확정된 부스 금액 (NULL 이면 승인 전 — 현재가 적용)'${after2}`
    );
    console.log('✅ applications.approvedPrice 컬럼 추가 완료');
  } else {
    console.log('➡️  applications.approvedPrice 이미 존재, 건너뜀');
  }

  if (!(await columnExists('applications', 'boothTypeId'))) {
    console.log('⚠️  컬럼 추가에 실패했습니다. 아래 상태 확인을 참고하세요.');
  } else {
    const [idx] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'applications'
          AND index_name = 'idx_application_booth_type'`
    );
    if (idx[0].cnt === 0) {
      await pool.query('ALTER TABLE applications ADD INDEX idx_application_booth_type (boothTypeId)');
      console.log('✅ applications.boothTypeId 인덱스 추가 완료');
    } else {
      console.log('➡️  applications 인덱스 이미 존재, 건너뜀');
    }
  }

  // 3) 결과 확인
  console.log('-----------------------------------------');
  const [[typeCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM market_booth_types');
  // 이미 승인·결제된 건에는 현재가로 금액을 채워 둡니다.
  //   안 채우면 그 건들은 계속 현재가를 따라가서, 이 패치 이후 가격을 바꾸면 금액이 흔들립니다.
  const [backfill] = await pool.query(
    `UPDATE applications a
       JOIN markets m ON m.marketId = a.marketId
       LEFT JOIN market_booth_types bt ON bt.boothTypeId = a.boothTypeId
        SET a.approvedPrice = COALESCE(bt.price, m.boothPrice)
      WHERE a.approvedPrice IS NULL AND a.status IN ('Approved', 'Paid')`
  );
  if (backfill.affectedRows > 0) {
    console.log(`✅ 이미 승인/결제된 신청 ${backfill.affectedRows}건의 금액을 현재가로 고정했습니다.`);
  }

  const [[appCount]] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM applications WHERE boothTypeId IS NOT NULL'
  );
  console.log('현재 상태:');
  console.log(`  - 등록된 부스 종류 ${typeCount.cnt}건`);
  const [[capCount]] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM market_booth_types WHERE capacity > 0');
  console.log(`  - 그중 종류별 정원이 지정된 것 ${capCount.cnt}건 (나머지는 제한 없음)`);
  console.log(`  - 부스 종류를 고른 신청 ${appCount.cnt}건 (나머지는 마켓 기본 부스료 적용)`);
  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 백엔드는 최대 60초 안에 자동으로 인식합니다.');
  console.log('(바로 반영하려면 서버를 재시작하세요.)');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  console.error('   markets / applications 테이블이 없으면 먼저 스키마를 준비해주세요.');
  process.exit(1);
});
