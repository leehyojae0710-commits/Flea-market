// backend/scripts/migrate-add-notifications.js
// [추가] 알림(종 버튼) 기능을 위해 notifications 테이블을 생성합니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-notifications.js

import pool from '../config/db.js';

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function run() {
  if (!(await tableExists('notifications'))) {
    await pool.query(`
      CREATE TABLE notifications (
        notificationId INT NOT NULL AUTO_INCREMENT,
        userId BIGINT UNSIGNED NOT NULL COMMENT '알림을 받는 사람',
        audience ENUM('host','seller') NOT NULL COMMENT '클릭 시 이동할 화면 (host=내 마켓 관리, seller=내 부스 관리)',
        type VARCHAR(40) NOT NULL COMMENT '알림 종류 (application_received, payment_completed 등)',
        title VARCHAR(100) NOT NULL,
        message VARCHAR(255) NOT NULL,
        marketId INT NULL,
        applicationId INT NULL,
        isRead TINYINT(1) NOT NULL DEFAULT 0,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (notificationId),
        KEY idx_user_created (userId, createdAt),
        KEY idx_user_unread (userId, isRead),
        CONSTRAINT notifications_ibfk_1 FOREIGN KEY (userId) REFERENCES users (userId) ON DELETE CASCADE,
        CONSTRAINT notifications_ibfk_2 FOREIGN KEY (marketId) REFERENCES markets (marketId) ON DELETE SET NULL,
        CONSTRAINT notifications_ibfk_3 FOREIGN KEY (applicationId) REFERENCES applications (applicationId) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ notifications 테이블 생성 완료');
  } else {
    console.log('➡️  notifications 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
