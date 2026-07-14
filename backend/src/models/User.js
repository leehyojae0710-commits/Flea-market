// 담당 C: 회원 테이블
// 실제 DDL은 1주차에 팀과 함께 확정해서 아래 SQL을 DB에 실행하세요.

/*
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password      VARCHAR(255) NOT NULL,       -- bcrypt 해시 저장
  phone         VARCHAR(20),
  region        VARCHAR(50),                 -- 거주 지역 (시/군/구)
  active_role   ENUM('host', 'seller') DEFAULT 'seller', -- 다중 권한 토글 상태
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
*/

module.exports = {}; // 순수 SQL(mysql2)을 쓸 경우 이 파일은 스키마 문서 용도로만 사용
