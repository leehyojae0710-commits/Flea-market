const mysql = require('mysql2');

// MySQL 커넥션 풀 생성 (환경 변수가 없을 경우 기본 로컬 환경값 적용)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1234', // 본인의 MySQL 비밀번호로 변경하세요
  database: process.env.DB_NAME || 'flea_market', // DB 스키마 명칭
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 연결 테스트용 로그 출력
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ MySQL 데이터베이스 연결 실패:', err.message);
  } else {
    console.log('✅ MySQL 데이터베이스 연결 성공!');
    connection.release();
  }
});

module.exports = pool;