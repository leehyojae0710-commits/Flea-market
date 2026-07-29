// backend/scripts/migrate-add-nickname-unique.js
// [신규] 닉네임 도입 마무리 마이그레이션
//
// 하는 일 (여러 번 실행해도 안전합니다)
//   1) users.nickname 컬럼이 없으면 추가
//   2) 닉네임이 비어 있는(NULL/'') 기존 회원에게 임시 닉네임(user{userId}) 자동 부여
//   3) 이미 중복된 닉네임이 있으면 뒤에 숫자를 붙여 자동 분리 (가장 먼저 가입한 사람이 원래 닉네임 유지)
//   4) users.nickname 에 UNIQUE 인덱스(uk_users_nickname) 생성
//
// 왜 필요한가
//   - 지금은 회원가입 때 SELECT 로만 중복을 검사해서, 동시에 요청이 들어오면 같은 닉네임이 2개 저장될 수 있습니다.
//   - UNIQUE 인덱스가 있어야 DB 차원에서 최종적으로 막힙니다.
//
// 실행: cd backend && node scripts/migrate-add-nickname-unique.js

import pool from '../config/db.js';

const NICKNAME_MAX_DB_LENGTH = 50; // 컬럼 길이 (입력 검증은 12자, 기존 데이터 보호를 위해 컬럼은 50 유지)

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  );
  return rows[0].cnt > 0;
}

/** 아직 아무도 쓰지 않는 닉네임을 만들어 돌려줍니다. */
async function makeAvailableNickname(base) {
  const safeBase = String(base || 'user').slice(0, NICKNAME_MAX_DB_LENGTH - 3);
  let candidate = safeBase;
  let suffix = 1;

  // 최대 999번까지 시도 (실사용 데이터에서는 몇 번이면 끝납니다)
  while (suffix < 1000) {
    const [rows] = await pool.query('SELECT userId FROM users WHERE nickname = ? LIMIT 1', [candidate]);
    if (rows.length === 0) return candidate;
    candidate = `${safeBase}${suffix}`;
    suffix += 1;
  }
  throw new Error(`사용 가능한 닉네임을 만들지 못했습니다. (base: ${base})`);
}

async function run() {
  // 1) 컬럼 보장
  if (!(await columnExists('users', 'nickname'))) {
    await pool.query(`ALTER TABLE users ADD COLUMN nickname VARCHAR(${NICKNAME_MAX_DB_LENGTH}) NULL`);
    console.log('✅ users.nickname 컬럼 추가 완료');
  } else {
    console.log('➡️  users.nickname 이미 존재, 건너뜀');
  }

  // 2) 빈 닉네임 백필
  const [emptyRows] = await pool.query(
    `SELECT userId FROM users WHERE nickname IS NULL OR TRIM(nickname) = '' ORDER BY userId`
  );
  for (const row of emptyRows) {
    const nickname = await makeAvailableNickname(`user${row.userId}`);
    await pool.query('UPDATE users SET nickname = ? WHERE userId = ?', [nickname, row.userId]);
    console.log(`   · userId=${row.userId} → 임시 닉네임 "${nickname}" 부여`);
  }
  console.log(`✅ 빈 닉네임 백필 완료 (${emptyRows.length}건)`);

  // 3) 중복 닉네임 분리 (가장 작은 userId 가 원래 닉네임을 유지)
  const [dupGroups] = await pool.query(
    `SELECT nickname, COUNT(*) AS cnt FROM users
     WHERE nickname IS NOT NULL
     GROUP BY nickname HAVING cnt > 1`
  );
  let renamed = 0;
  for (const group of dupGroups) {
    const [members] = await pool.query(
      'SELECT userId FROM users WHERE nickname = ? ORDER BY userId',
      [group.nickname]
    );
    // 첫 번째(가장 먼저 가입한) 사람은 그대로 두고 나머지만 변경
    for (const member of members.slice(1)) {
      const nickname = await makeAvailableNickname(group.nickname);
      await pool.query('UPDATE users SET nickname = ? WHERE userId = ?', [nickname, member.userId]);
      console.log(`   · userId=${member.userId} "${group.nickname}" → "${nickname}" 으로 변경`);
      renamed += 1;
    }
  }
  console.log(`✅ 중복 닉네임 정리 완료 (${renamed}건 변경)`);

  // 4) UNIQUE 인덱스
  if (!(await indexExists('users', 'uk_users_nickname'))) {
    await pool.query('ALTER TABLE users ADD UNIQUE KEY uk_users_nickname (nickname)');
    console.log('✅ users.nickname UNIQUE 인덱스(uk_users_nickname) 생성 완료');
  } else {
    console.log('➡️  uk_users_nickname 인덱스 이미 존재, 건너뜀');
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
