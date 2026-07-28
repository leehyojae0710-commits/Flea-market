// backend/scripts/migrate-add-seller-reviews.js
// [추가] 주최자가 판매자를 평가하는 seller_reviews 테이블 생성 (market_reviews와 대칭 구조)
// 실행: cd backend && node scripts/migrate-add-seller-reviews.js

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
    if (!(await tableExists('seller_reviews'))) {
        await pool.query(`
      CREATE TABLE seller_reviews (
        reviewId INT NOT NULL AUTO_INCREMENT,
        applicationId INT NOT NULL COMMENT '평가 대상 부스 신청(승인+결제완료 건)',
        marketId INT NOT NULL,
        sellerId BIGINT UNSIGNED NOT NULL COMMENT '평가받는 판매자',
        hostId BIGINT UNSIGNED NOT NULL COMMENT '평가하는 주최자',
        rating TINYINT NOT NULL COMMENT '0~5 사이의 별점',
        comment VARCHAR(200) NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (reviewId),
        UNIQUE KEY uniq_application_seller_review (applicationId),
        KEY marketId (marketId),
        KEY sellerId (sellerId),
        CONSTRAINT seller_reviews_ibfk_1 FOREIGN KEY (applicationId) REFERENCES applications (applicationId) ON DELETE CASCADE,
        CONSTRAINT seller_reviews_ibfk_2 FOREIGN KEY (marketId) REFERENCES markets (marketId) ON DELETE CASCADE,
        CONSTRAINT seller_reviews_ibfk_3 FOREIGN KEY (sellerId) REFERENCES users (userId) ON DELETE CASCADE,
        CONSTRAINT seller_reviews_ibfk_4 FOREIGN KEY (hostId) REFERENCES users (userId) ON DELETE CASCADE,
        CONSTRAINT chk_seller_reviews_rating CHECK (rating BETWEEN 0 AND 5)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
        console.log('✅ seller_reviews 테이블 생성 완료');
    } else {
        console.log('➡️  이미 존재, 건너뜀');
    }
    console.log('마이그레이션 완료! 서버를 재시작해주세요.');
    process.exit(0);
}

run().catch((err) => {
    console.error('❌ 마이그레이션 중 오류:', err.message);
    process.exit(1);
});