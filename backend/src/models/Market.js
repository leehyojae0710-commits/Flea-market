// 담당 C/D: 마켓(플리마켓 공고) 테이블

/*
CREATE TABLE markets (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  host_id       INT NOT NULL,                -- users.id (주최측)
  title         VARCHAR(100) NOT NULL,
  description   TEXT,
  event_date    DATE NOT NULL,
  booth_price   INT DEFAULT 0,
  address       VARCHAR(255),
  latitude      DOUBLE,                      -- 담당 E: 지도 좌표
  longitude     DOUBLE,                      -- 담당 E: 지도 좌표
  is_expired    BOOLEAN DEFAULT FALSE,        -- event_date < 오늘이면 true
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id) REFERENCES users(id)
);
*/

module.exports = {};
