// 담당 D: 부스 신청 및 결제 상태 테이블

/*
CREATE TABLE applications (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  market_id     INT NOT NULL,                -- markets.id
  seller_id     INT NOT NULL,                -- users.id (판매자)
  booth_number  VARCHAR(20),                 -- 텍스트 버튼으로 선택한 부스 번호 (예: "1번")
  product_image VARCHAR(255),
  product_desc  TEXT,
  status        ENUM('pending', 'approved', 'rejected', 'paid') DEFAULT 'pending',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (market_id) REFERENCES markets(id),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);
*/

module.exports = {};
