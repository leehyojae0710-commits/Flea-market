// backend/scripts/migrate-add-active-role.js
// [JWT activeRole 포함 및 재발급 보완 - 신규 마이그레이션]
//
// 실행: cd backend && node scripts/migrate-add-active-role.js
// 여러 번 실행해도 안전합니다. (있으면 건너뜀)
//
// 이 스크립트가 필요한 이유
//   기존 정의는 `activeRole VARCHAR(10) DEFAULT 'seller'` 였고,
//   회원가입 INSERT 에는 activeRole 이 빠져 있었습니다.
//   그래서 지금 DB 에 있는 주최자 계정은 사실상 전부 activeRole='seller' 입니다.
//
//   그동안은 프론트가 로그인할 때 화면 모드를 무조건 'host' 로 덮어써서 티가 나지 않았는데,
//   activeRole 을 토큰에 싣는 순간 이 값이 그대로 쓰이기 때문에
//   "주최자로 로그인했는데 판매자 모드로 시작"하는 현상이 발생합니다.
//
//   그래서 이 스크립트가 하는 일은 두 가지입니다.
//     1) 기본값을 'seller' -> NULL 로 변경 (NULL = "지정 안 함" = 계정 종류를 따름)
//     2) 기존 데이터 백필: 주최자 계정 -> 'host', 판매자 계정 -> 'seller'

import pool from '../config/db.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function main() {
  console.log('▶ users.activeRole 마이그레이션을 시작합니다.');

  // 1) 컬럼이 없으면 만듭니다. (기본값 NULL)
  if (!(await columnExists('users', 'activeRole'))) {
    await pool.query("ALTER TABLE users ADD COLUMN activeRole VARCHAR(10) DEFAULT NULL");
    console.log('✅ users.activeRole 컬럼을 추가했습니다. (DEFAULT NULL)');
  } else {
    // 2) 이미 있으면 기본값만 NULL 로 바꿉니다.
    //    'seller' 기본값을 그대로 두면 앞으로 가입하는 주최자가 또 판매자 모드로 들어갑니다.
    await pool.query("ALTER TABLE users MODIFY COLUMN activeRole VARCHAR(10) DEFAULT NULL");
    console.log('✅ users.activeRole 기본값을 NULL 로 변경했습니다.');
  }

  // 3) 기존 데이터 백필
  //    - 판매자 계정(userType=0)은 정책상 항상 seller 이므로 값을 고정합니다.
  //    - 주최자 계정(userType=1)은 'host' 로 초기화합니다.
  //      (지금 DB 의 'seller' 는 사용자가 직접 전환한 값이 아니라 컬럼 기본값이 남은 것이라 되돌립니다.)
  const [seller] = await pool.query(
    "UPDATE users SET activeRole = 'seller' WHERE userType = 0 AND (activeRole IS NULL OR activeRole <> 'seller')"
  );
  const [host] = await pool.query(
    "UPDATE users SET activeRole = 'host' WHERE userType = 1"
  );

  console.log(`✅ 백필 완료 - 판매자 ${seller.affectedRows}건 / 주최자 ${host.affectedRows}건`);

  const [[check]] = await pool.query(
    "SELECT SUM(userType = 1 AND activeRole = 'host') AS hostOk, SUM(userType = 0 AND activeRole = 'seller') AS sellerOk, COUNT(*) AS total FROM users"
  );
  console.log(`▶ 검증 - 전체 ${check.total}명 / 주최자 host ${check.hostOk ?? 0}명 / 판매자 seller ${check.sellerOk ?? 0}명`);
  console.log('🎉 마이그레이션이 완료되었습니다.');
}

main()
  .catch((error) => {
    console.error('❌ 마이그레이션 실패:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
