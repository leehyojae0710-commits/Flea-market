// backend/scripts/migrate-add-swagger-columns.js
// 마켓/신청/댓글/결제/역할전환 API에 필요한 컬럼·테이블을 기존 DB에 안전하게 추가합니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-swagger-columns.js

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
  if (!(await columnExists('markets', 'boothPrice'))) {
    await pool.query('ALTER TABLE markets ADD COLUMN boothPrice INT DEFAULT 0');
    console.log('✅ markets.boothPrice 컬럼 추가 완료');
  } else {
    console.log('➡️  markets.boothPrice 이미 존재, 건너뜀');
  }

  if (!(await columnExists('applications', 'productDesc'))) {
    await pool.query('ALTER TABLE applications ADD COLUMN productDesc TEXT');
    console.log('✅ applications.productDesc 컬럼 추가 완료');
  } else {
    console.log('➡️  applications.productDesc 이미 존재, 건너뜀');
  }

  if (!(await columnExists('users', 'activeRole'))) {
    await pool.query("ALTER TABLE users ADD COLUMN activeRole VARCHAR(10) DEFAULT 'seller'");
    console.log('✅ users.activeRole 컬럼 추가 완료');
  } else {
    console.log('➡️  users.activeRole 이미 존재, 건너뜀');
  }

  if (!(await tableExists('comments'))) {
    await pool.query(`
      CREATE TABLE comments (
        commentId INT NOT NULL AUTO_INCREMENT,
        targetType VARCHAR(20) NOT NULL,
        targetId INT NOT NULL,
        userId BIGINT UNSIGNED NOT NULL,
        content VARCHAR(500) NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (commentId),
        KEY userId (userId),
        KEY target (targetType, targetId),
        CONSTRAINT comments_ibfk_1 FOREIGN KEY (userId) REFERENCES users (userId) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ comments 테이블 생성 완료');
  } else {
    console.log('➡️  comments 테이블 이미 존재, 건너뜀');
  }

  if (!(await tableExists('payments'))) {
    await pool.query(`
      CREATE TABLE payments (
        paymentId INT NOT NULL AUTO_INCREMENT,
        applicationId INT NOT NULL,
        amount INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'Paid',
        paidAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (paymentId),
        KEY applicationId (applicationId),
        CONSTRAINT payments_ibfk_1 FOREIGN KEY (applicationId) REFERENCES applications (applicationId) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ payments 테이블 생성 완료');
  } else {
    console.log('➡️  payments 테이블 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
