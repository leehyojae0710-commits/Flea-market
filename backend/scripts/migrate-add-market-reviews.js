// backend/scripts/migrate-add-market-reviews.js
// [추가] 행사 평가(별점) 기능을 위해 market_reviews 테이블을 생성합니다.
// 부스 신청(application) 1건당 평가 1건만 남길 수 있도록 applicationId에 UNIQUE 제약을 겁니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-market-reviews.js

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
  if (!(await tableExists('market_reviews'))) {
    await pool.query(`
      CREATE TABLE market_reviews (
        reviewId INT NOT NULL AUTO_INCREMENT,
        applicationId INT NOT NULL COMMENT '평가 대상 부스 신청(승인된 건)',
        marketId INT NOT NULL,
        sellerId BIGINT UNSIGNED NOT NULL,
        rating TINYINT NOT NULL COMMENT '0~5 사이의 별점',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (reviewId),
        UNIQUE KEY uniq_application_review (applicationId),
        KEY marketId (marketId),
        KEY sellerId (sellerId),
        CONSTRAINT market_reviews_ibfk_1 FOREIGN KEY (applicationId) REFERENCES applications (applicationId) ON DELETE CASCADE,
        CONSTRAINT market_reviews_ibfk_2 FOREIGN KEY (marketId) REFERENCES markets (marketId) ON DELETE CASCADE,
        CONSTRAINT market_reviews_ibfk_3 FOREIGN KEY (sellerId) REFERENCES users (userId) ON DELETE CASCADE,
        CONSTRAINT chk_market_reviews_rating CHECK (rating BETWEEN 0 AND 5)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ market_reviews 테이블 생성 완료');
  } else {
    console.log('➡️  market_reviews 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
