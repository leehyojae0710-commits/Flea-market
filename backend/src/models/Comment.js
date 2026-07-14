// 담당 D: 댓글 테이블 (공고/판매자 페이지 공용)

/*
CREATE TABLE comments (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  target_type   ENUM('market', 'application') NOT NULL, -- 어디에 달린 댓글인지
  target_id     INT NOT NULL,                            -- markets.id 또는 applications.id
  writer_id     INT NOT NULL,                             -- users.id
  content       TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (writer_id) REFERENCES users(id)
);
*/

module.exports = {};
