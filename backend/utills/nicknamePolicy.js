// backend/utills/nicknamePolicy.js
// [신규] 닉네임 정책 "단일 소스" 파일
// - 회원가입(authRoutes.js), 중복확인 API(authRoutes.js), 프로필 수정(profileController.js),
//   회원가입 검증 미들웨어(registerValidationMiddleware.js)가 모두 이 파일의 규칙을 씁니다.
// - 규칙이 바뀌면 이 파일 하나만 고치면 됩니다.
//   (프론트는 frontend/common/js/validators.js 의 NICKNAME_REGEX 와 같은 값을 유지해주세요.)

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

// 한글/영문/숫자 2~12자 (공백·특수문자 불가)
export const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]{2,12}$/;

// 사칭 방지용 예약어 (비교는 소문자로)
export const RESERVED_NICKNAMES = [
  '관리자', '운영자', '운영팀', '고객센터', '플리마켓',
  'admin', 'administrator', 'root', 'master', 'system', 'host', 'seller',
];

/** 앞뒤 공백만 제거합니다. (내부 공백은 정규식에서 걸립니다) */
export function normalizeNickname(value) {
  return String(value ?? '').trim();
}

/**
 * 닉네임 형식 검증
 * @returns {{ ok: boolean, nickname: string, message: string }}
 */
export function validateNickname(value) {
  const nickname = normalizeNickname(value);

  if (!nickname) {
    return { ok: false, nickname: '', message: '닉네임을 입력해주세요.' };
  }
  if (!NICKNAME_REGEX.test(nickname)) {
    return {
      ok: false,
      nickname,
      message: `닉네임은 한글/영문/숫자 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해주세요.`,
    };
  }
  if (RESERVED_NICKNAMES.includes(nickname.toLowerCase())) {
    return { ok: false, nickname, message: '사용할 수 없는 닉네임입니다.' };
  }
  return { ok: true, nickname, message: '' };
}

/**
 * DB 중복 확인
 * - users 테이블 콜레이션이 utf8mb4_0900_ai_ci 라서 대소문자를 구분하지 않고 비교됩니다. ("Abc" === "abc")
 * - excludeUserId 를 주면 "본인이 이미 쓰고 있는 닉네임"은 중복으로 보지 않습니다. (프로필 수정용)
 */
export async function isNicknameTaken(pool, nickname, excludeUserId = null) {
  let sql = 'SELECT userId FROM users WHERE nickname = ?';
  const values = [nickname];

  if (excludeUserId !== null && excludeUserId !== undefined) {
    sql += ' AND userId <> ?';
    values.push(excludeUserId);
  }
  sql += ' LIMIT 1';

  const [rows] = await pool.query(sql, values);
  return rows.length > 0;
}

/**
 * UNIQUE 인덱스(uk_users_nickname) 충돌 여부
 * - 두 사람이 "동시에" 같은 닉네임으로 가입 요청을 보내면 SELECT 중복검사만으로는 막을 수 없습니다.
 *   최종 방어선은 DB UNIQUE 인덱스이고, 그때 나는 오류를 409로 바꿔주기 위한 함수입니다.
 * - 인덱스는 scripts/migrate-add-nickname-unique.js 로 생성합니다.
 */
export function isDuplicateKeyError(error) {
  return Boolean(error) && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062);
}
