// backend/config/db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'flea_market_db',
  port: Number(process.env.DB_PORT) || 3306,
};

const pool = mysql.createPool(dbConfig);

// 서버 켤 때 연결 확인 및 테이블 목록 출력 로직
pool.getConnection()
  .then(async (conn) => {
    console.log(`데이터베이스 연결 성공! 🚀 (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`);

    // 📌 DB 내에 존재하는 테이블 목록 조회
    const [rows] = await conn.query('SHOW TABLES;');
    console.log("-----------------------------------------");
    console.log("📊 현재 생성된 테이블 목록:");

    if (rows.length === 0) {
      console.log("⚠️ 생성된 테이블이 없습니다. init_with_data.sql을 실행해주세요.");
    } else {
      rows.forEach(row => {
        console.log(`  - ${Object.values(row)[0]}`);
      });
    }
    console.log("-----------------------------------------");

    conn.release();
  })
  .catch((err) => {
    console.error("DB 연결 실패 ❌ .env의 DB_HOST/DB_USER/DB_PASSWORD를 확인하세요:", err.message);
  });

export default pool;
