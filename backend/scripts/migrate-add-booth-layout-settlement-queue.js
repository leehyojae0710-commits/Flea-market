// backend/scripts/migrate-add-booth-layout-settlement-queue.js
// [추가] 부스 배치(드래그 앤 드롭) / 정산 관리 / 결제 대기열 타임아웃 기능에 필요한
// 컬럼·테이블을 기존 DB에 안전하게 추가합니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-booth-layout-settlement-queue.js

import pool from '../config/db.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function run() {
  // 1. [결제 대기열 타임아웃] applications.paymentDueAt
  if (!(await columnExists('applications', 'paymentDueAt'))) {
    await pool.query('ALTER TABLE applications ADD COLUMN paymentDueAt TIMESTAMP NULL DEFAULT NULL');
    console.log('✅ applications.paymentDueAt 컬럼 추가 완료');
  } else {
    console.log('➡️  applications.paymentDueAt 이미 존재, 건너뜀');
  }

  // 2. [정산 관리] markets.settlementNotifiedAt
  if (!(await columnExists('markets', 'settlementNotifiedAt'))) {
    await pool.query('ALTER TABLE markets ADD COLUMN settlementNotifiedAt TIMESTAMP NULL DEFAULT NULL');
    console.log('✅ markets.settlementNotifiedAt 컬럼 추가 완료');
  } else {
    console.log('➡️  markets.settlementNotifiedAt 이미 존재, 건너뜀');
  }

  // 3. [부스 배치] booth_layouts 테이블
  if (!(await tableExists('booth_layouts'))) {
    await pool.query(`
      CREATE TABLE booth_layouts (
        layoutId INT NOT NULL AUTO_INCREMENT,
        marketId INT NOT NULL,
        applicationId INT NOT NULL,
        positionX INT NOT NULL DEFAULT 0,
        positionY INT NOT NULL DEFAULT 0,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (layoutId),
        UNIQUE KEY uniq_market_application (marketId, applicationId),
        KEY marketId (marketId),
        CONSTRAINT booth_layouts_market_fk FOREIGN KEY (marketId) REFERENCES markets (marketId) ON DELETE CASCADE,
        CONSTRAINT booth_layouts_application_fk FOREIGN KEY (applicationId) REFERENCES applications (applicationId) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ booth_layouts 테이블 생성 완료');
  } else {
    console.log('➡️  booth_layouts 테이블 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
