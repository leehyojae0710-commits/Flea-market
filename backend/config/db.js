// backend/config/db.js
import mysql from 'mysql2/promise';

// 📌 중요: password 칸에 MySQL 설치할 때 설정한 본인 비밀번호를 넣으세요!
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '1234', 
  database: 'flea_market_db',
  port: 3306
};

// 연결 풀(Pool) 생성
const pool = mysql.createPool(dbConfig);

// 서버 켤 때 연결이 잘 되었는지 확인용 로그
pool.getConnection()
  .then((conn) => {
    console.log("데이터베이스 연결 성공! 🚀 플리마켓 로컬 DB 가동");
    conn.release();
  })
  .catch((err) => {
    console.error("DB 연결 실패 ❌ 비밀번호나 포트를 확인하세요:", err.message);
  });

export default pool;