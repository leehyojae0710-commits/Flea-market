// backend/scripts/hash-seed-passwords.js
// 평문으로 들어있는 시드 데이터 비밀번호를 bcrypt 해시로 일괄 변환합니다.
// 이미 해시된 값($2로 시작)은 건드리지 않아서 여러 번 실행해도 안전합니다.
//
// 실행: cd backend && node scripts/hash-seed-passwords.js

import bcrypt from 'bcrypt';
import pool from '../config/db.js';

const SALT_ROUNDS = 10;

async function run() {
  const [users] = await pool.query('SELECT userId, userType, password FROM users');

  let updated = 0;

  for (const user of users) {
    const isAlreadyHashed = typeof user.password === 'string' && user.password.startsWith('$2');
    if (isAlreadyHashed) continue;

    const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
    await pool.query(
      'UPDATE users SET password = ? WHERE userId = ? AND userType = ?',
      [hashed, user.userId, user.userType]
    );
    console.log(`✅ ${user.userId} (userType=${user.userType}) 비밀번호 해시 완료`);
    updated += 1;
  }

  console.log(`-----------------------------------------`);
  console.log(`총 ${users.length}명 중 ${updated}명 해시 처리함 (나머지는 이미 해시됨)`);
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 해시 처리 중 오류:', err.message);
  process.exit(1);
});