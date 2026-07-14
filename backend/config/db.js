// backend/config/db.js
import mysql from 'mysql2/promise';

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '1234', // 📌 본인 MySQL 비밀번호로 유지하세요!
  database: 'flea_market_db',
  port: 3306
};

const pool = mysql.createPool(dbConfig);

// 서버 켤 때 연결 확인 및 테이블 목록 출력 로직
pool.getConnection()
  .then(async (conn) => {
    console.log("데이터베이스 연결 성공! 🚀 플리마켓 로컬 DB 가동");
    
    // 📌 추가된 부분: DB 내에 존재하는 테이블 목록 조회
    const [rows] = await conn.query('SHOW TABLES;');
    console.log("-----------------------------------------");
    console.log("📊 현재 생성된 테이블 목록:");
    
    if (rows.length === 0) {
      console.log("⚠️ 생성된 테이블이 없습니다. init.sql을 실행해주세요.");
    } else {
      rows.forEach(row => {
        // row의 key 값이 'Tables_in_flea_market_db' 형태로 나오므로 value만 추출
        console.log(`  - ${Object.values(row)[0]}`);
      });
    }
    console.log("-----------------------------------------");
    
    conn.release();
  })
  .catch((err) => {
    console.error("DB 연결 실패 ❌ 비밀번호나 포트를 확인하세요:", err.message);
  });

export default pool;