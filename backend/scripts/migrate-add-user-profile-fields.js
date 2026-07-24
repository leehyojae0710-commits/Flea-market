// backend/scripts/migrate-add-user-profile-fields.js
// [추가] 마이페이지 "프로필" 화면(닉네임/프로필 사진/한 줄 소개/소개글/소개 이미지)을 위해
// users 테이블에 컬럼을 추가합니다.
// 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
//
// 실행: cd backend && node scripts/migrate-add-user-profile-fields.js

import pool from '../config/db.js';

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

const COLUMNS = [
  // [닉네임] "닉네임 + ~의 플리마켓" 타이틀에 사용
  { name: 'nickname', ddl: 'VARCHAR(50) NULL' },
  // [프로필 사진] 원형으로 보여줄 대표 이미지 경로 (예: /uploads/profile/1/xxx.jpg)
  { name: 'profileImage', ddl: 'VARCHAR(255) NULL' },
  // [프로필 한 줄 소개] 프로필 사진 옆에 짧게 보여줄 소개 문구
  { name: 'introText', ddl: 'VARCHAR(150) NULL' },
  // [소개글] 마이페이지 하단 "소개글" 섹션에 보여줄 긴 소개 텍스트
  { name: 'bioText', ddl: 'TEXT NULL' },
  // [소개 이미지] "소개글" 옆에 보여줄 대표 이미지 경로
  { name: 'bioImage', ddl: 'VARCHAR(255) NULL' },
];

async function run() {
  for (const col of COLUMNS) {
    if (!(await columnExists('users', col.name))) {
      await pool.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.ddl}`);
      console.log(`✅ users.${col.name} 컬럼 추가 완료`);
    } else {
      console.log(`➡️  users.${col.name} 이미 존재, 건너뜀`);
    }
  }

  console.log('-----------------------------------------');
  console.log('마이그레이션 완료! 서버를 재시작해주세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 마이그레이션 중 오류:', err.message);
  process.exit(1);
});
