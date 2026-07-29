// backend/scripts/migrate-add-auth-sessions.js
// [세션/토큰 발급 보완 - 신규 파일]
// 리프레시 토큰 / 로그아웃 무효화를 위한 auth_sessions 테이블을 생성합니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-auth-sessions.js

import pool from '../config/db.js';

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function getUserIdColumnType() {
  // users.userId 가 팀 DB마다 INT / BIGINT UNSIGNED 로 다를 수 있어서 실제 타입을 읽어옵니다.
  // (외래키는 타입이 정확히 같아야 걸립니다.)
  const [rows] = await pool.query(
    `SELECT COLUMN_TYPE AS colType FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'userId'`
  );
  return rows.length > 0 ? rows[0].colType : 'BIGINT UNSIGNED';
}

async function run() {
  if (await tableExists('auth_sessions')) {
    console.log('➡️  auth_sessions 테이블 이미 존재, 건너뜀');
    return;
  }

  const userIdType = await getUserIdColumnType();
  console.log(`ℹ️  users.userId 타입: ${userIdType}`);

  await pool.query(`
    CREATE TABLE auth_sessions (
      sessionId        VARCHAR(36)  NOT NULL COMMENT '세션 ID (액세스 토큰 payload.sid)',
      userId           ${userIdType} NOT NULL,
      refreshTokenHash CHAR(64)     NOT NULL COMMENT '리프레시 토큰 SHA-256 (원문은 저장하지 않음)',
      userAgent        VARCHAR(255) DEFAULT NULL,
      ipAddress        VARCHAR(45)  DEFAULT NULL,
      issuedAt         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lastUsedAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt        DATETIME     NOT NULL,
      revokedAt        DATETIME     DEFAULT NULL COMMENT '로그아웃/강제 폐기 시각',
      PRIMARY KEY (sessionId),
      UNIQUE KEY uk_auth_sessions_refresh (refreshTokenHash),
      KEY idx_auth_sessions_user (userId),
      CONSTRAINT fk_auth_sessions_user FOREIGN KEY (userId) REFERENCES users (userId) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  console.log('✅ auth_sessions 테이블 생성 완료');
  console.log('   - 리프레시 토큰 재발급(POST /api/auth/refresh)');
  console.log('   - 로그아웃 시 서버측 토큰 무효화');
  console.log('   - 로그인 기기 목록 조회(GET /api/auth/sessions)');
}

run()
  .catch((error) => {
    console.error('❌ 마이그레이션 실패:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
