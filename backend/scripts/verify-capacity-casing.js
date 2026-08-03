// backend/scripts/verify-capacity-casing.js
// [점검 스크립트] 컬럼명 대소문자 때문에 정원 검사가 무력화되지 않는지 확인합니다.
//
// 무슨 문제였나
//   markets 의 정원 컬럼은 실제로 `maxParticipants`(대문자 P)로 만들어져 있는데,
//   applicationPolicy 는 'maxparticipants'(소문자)로 존재 여부를 확인했습니다.
//   information_schema 조회 결과는 정의된 표기 그대로라 대소문자를 가리므로,
//   "그런 컬럼 없음"으로 판정 → 정원 값을 SELECT 하지 않음 → undefined → NaN →
//   **정원 검사가 통째로 건너뛰어졌습니다.**
//   (초과 신청 허용을 꺼도 계속 초과 신청이 되던 원인)
//
// 이 스크립트는 대문자/소문자 두 스키마를 각각 임시 DB 에 만들어,
// 양쪽 모두에서 정원이 제대로 막히는지 확인합니다.
//
// 실행: cd backend && node scripts/verify-capacity-casing.js
//   .env 의 DB 계정으로 임시 DB(_capcheck_upper / _capcheck_lower)를 만들었다가 지웁니다.
//   운영 DB 의 데이터는 건드리지 않습니다.

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { checkBoothApplyEligibility, resetMarketColumnCache } from '../utills/applicationPolicy.js';

dotenv.config();

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

const CONN = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** 정원 컬럼 표기만 다른 스키마를 만들고, 신청 판정을 돌려봅니다. */
async function scenario(dbName, capacityColumn, { overcapacity }) {
  const root = await mysql.createPool({ ...CONN, multipleStatements: true });
  await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await root.query(`CREATE DATABASE \`${dbName}\``);
  await root.end();

  const db = await mysql.createPool({ ...CONN, database: dbName });

  await db.query(`
    CREATE TABLE markets (
      marketId INT AUTO_INCREMENT PRIMARY KEY,
      hostId INT NOT NULL,
      title VARCHAR(50),
      isExpired TINYINT DEFAULT 0,
      ${capacityColumn} INT DEFAULT 2,
      allowOvercapacity TINYINT DEFAULT 0,
      allowDuplicateApplication TINYINT DEFAULT 1,
      eventDate_min DATE, eventDate_max DATE,
      recruitmentDate_min DATE, recruitmentDate_max DATE
    )`);
  await db.query(`
    CREATE TABLE applications (
      applicationId INT AUTO_INCREMENT PRIMARY KEY,
      marketId INT, sellerId INT, boothNumber VARCHAR(10),
      status VARCHAR(20) DEFAULT 'Pending'
    )`);

  await db.query(
    `INSERT INTO markets (hostId, title, ${capacityColumn}, allowOvercapacity,
       eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max)
     VALUES (1, 't', 2, ?, ?, ?, ?, ?)`,
    [overcapacity ? 1 : 0, day(30), day(31), day(-10), day(30)]
  );

  // 정원 2인 마켓에 이미 2건이 차 있는 상태
  await db.query(
    `INSERT INTO applications (marketId, sellerId, boothNumber, status)
     VALUES (1, 11, 'A-1', 'Pending'), (1, 12, 'A-2', 'Approved')`
  );

  resetMarketColumnCache();
  const result = await checkBoothApplyEligibility(db, {
    userId: 99, marketId: 1, boothNumber: 'A-3',
  });

  await db.query(`DROP DATABASE \`${dbName}\``);
  await db.end();
  resetMarketColumnCache();
  return result;
}

console.log('\n[1] 정원 컬럼이 maxParticipants (대문자 P) — 실제 팀 DB 형태');

let r = await scenario('_capcheck_upper', 'maxParticipants', { overcapacity: false });
check('초과 허용 OFF → 정원 초과 신청 거부',
  r.ok === false && r.code === 'CAPACITY_FULL', JSON.stringify(r));
check('안내에 현재/정원 표시', r.ok === false && /2\/2/.test(r.message || ''), r.message);

r = await scenario('_capcheck_upper', 'maxParticipants', { overcapacity: true });
check('초과 허용 ON → 통과', r.ok === true, JSON.stringify(r));

console.log('\n[2] 정원 컬럼이 maxparticipants (소문자) — 다른 환경 대비');

r = await scenario('_capcheck_lower', 'maxparticipants', { overcapacity: false });
check('초과 허용 OFF → 정원 초과 신청 거부',
  r.ok === false && r.code === 'CAPACITY_FULL', JSON.stringify(r));

r = await scenario('_capcheck_lower', 'maxparticipants', { overcapacity: true });
check('초과 허용 ON → 통과', r.ok === true, JSON.stringify(r));

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
if (failures.length > 0) {
  console.log('\n실패 목록:');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(fail > 0 ? 1 : 0);
