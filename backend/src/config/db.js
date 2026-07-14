// DB 연결 설정 - 담당 C가 관리합니다.
// 1주차에 팀 전체가 확정한 ERD(User, Market, Application, Comment)를 기준으로 합니다.

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'flea_market',
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
