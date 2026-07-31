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
      // [DB 사고 방지] 예전에는 여기서 "init_with_data.sql을 실행해주세요" 라고 안내했습니다.
      //   그런데 그 파일은 users/markets/applications 를 DROP 하고 다시 만드는 파일이라,
      //   .env 의 DB_NAME 을 잘못 적어 이 메시지를 본 사람이 안내대로 실행하면
      //   (Workbench 는 팀 DB 에 붙어 있는 채로) 실제 데이터가 통째로 날아갑니다.
      //   그래서 안내를 데이터를 지우지 않는 마이그레이션 스크립트로 바꿨습니다.
      console.log("⚠️ 이 DB 에는 테이블이 없습니다.");
      console.log("   1) .env 의 DB_NAME 이 맞는지부터 확인하세요. (현재: " + dbConfig.database + ")");
      console.log("   2) 정말 새 DB 라면: cd backend && node scripts/migrate-add-swagger-columns.js");
      console.log("      (scripts 폴더의 migrate-*.js 를 순서대로 실행하면 최신 스키마가 됩니다)");
      console.log("   ※ config/DANGER_*.sql 은 비어 있는 새 DB 에만 쓰세요. 기존 DB 에 실행하면 데이터가 전부 삭제됩니다.");
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
