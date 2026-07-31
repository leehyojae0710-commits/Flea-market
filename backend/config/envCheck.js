// backend/config/envCheck.js
// [보안·환경 정리 - 신규]
//
// 서버가 뜰 때 환경변수 상태를 한 번 점검하고, 위험한 설정이면 눈에 띄게 알려 줍니다.
//
// 왜 필요한가
//   - .env 를 안 만들고 서버를 켜면 DB_PASSWORD 가 빈 문자열로 들어가 연결만 실패하고,
//     정작 원인은 로그 저 아래에 묻혀서 팀원마다 삽질을 반복했습니다.
//   - JWT_SECRET 을 기본값 그대로 쓰면 이 값을 아는 사람은 아무 계정의 토큰이나 만들 수 있습니다.
//     개발 중에는 괜찮지만 배포에 그대로 나가면 사고입니다.
//   - 값은 절대 그대로 찍지 않고 마스킹해서 보여 줍니다. (로그·화면 공유로 새는 걸 막기 위해)

const DEFAULT_JWT_SECRET = 'flea-market-dev-secret-change-me';

/** 값을 앞 2글자만 남기고 가립니다. 비어 있으면 '(미설정)' */
function mask(value) {
  if (value === undefined || value === null || value === '') return '(미설정)';
  const text = String(value);
  if (text.length <= 2) return '*'.repeat(text.length);
  return text.slice(0, 2) + '*'.repeat(Math.min(text.length - 2, 10));
}

export function checkEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const warnings = [];
  const errors = [];

  // 1) DB 접속 정보 — 없으면 서버는 뜨지만 모든 API 가 500 이 됩니다.
  for (const key of ['DB_HOST', 'DB_USER', 'DB_NAME']) {
    if (!process.env[key]) {
      warnings.push(`${key} 가 비어 있습니다. backend/.env 를 만들었는지 확인하세요. (.env.example 복사)`);
    }
  }

  // 2) JWT_SECRET — 기본값이면 토큰을 누구나 위조할 수 있습니다.
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    warnings.push('JWT_SECRET 이 없어 개발용 기본값을 씁니다. 배포 전에 반드시 설정하세요.');
  } else if (secret === DEFAULT_JWT_SECRET) {
    warnings.push('JWT_SECRET 이 예제 기본값 그대로입니다. 공개된 값이라 토큰 위조가 가능합니다.');
  } else if (secret.length < 32) {
    warnings.push(`JWT_SECRET 이 너무 짧습니다(${secret.length}자). 32자 이상을 권장합니다.`);
  }

  if (isProduction && (!secret || secret === DEFAULT_JWT_SECRET)) {
    errors.push('운영 환경에서 JWT_SECRET 이 비어 있거나 기본값입니다.');
  }

  // 3) CORS — 미설정이면 모든 사이트에서 이 API 를 호출할 수 있습니다.
  if (!process.env.CORS_ORIGINS) {
    const message = 'CORS_ORIGINS 가 없어 모든 출처를 허용합니다. (개발 중에는 편하지만 배포 전에는 지정하세요)';
    isProduction ? errors.push(message) : warnings.push(message);
  }

  // 4) 결제 연동 키
  if (!process.env.PORTONE_API_SECRET) {
    warnings.push('PORTONE_API_SECRET 이 없습니다. 결제 승인/취소 API 가 실패합니다.');
  }

  console.log('-----------------------------------------');
  console.log('🔐 환경변수 점검');
  console.log(`  NODE_ENV            : ${process.env.NODE_ENV || '(미설정 = development)'}`);
  console.log(`  DB_HOST/DB_NAME     : ${process.env.DB_HOST || '(미설정)'} / ${process.env.DB_NAME || '(미설정)'}`);
  console.log(`  DB_PASSWORD         : ${mask(process.env.DB_PASSWORD)}`);
  console.log(`  JWT_SECRET          : ${mask(process.env.JWT_SECRET)}`);
  console.log(`  PORTONE_API_SECRET  : ${mask(process.env.PORTONE_API_SECRET)}`);
  console.log(`  CORS_ORIGINS        : ${process.env.CORS_ORIGINS || '(미설정 = 전체 허용)'}`);

  if (warnings.length > 0) {
    console.log('  ── 확인이 필요한 항목');
    warnings.forEach((w) => console.log(`   ⚠️  ${w}`));
  }
  console.log('-----------------------------------------');

  if (errors.length > 0) {
    errors.forEach((e) => console.error(`  ❌ ${e}`));
    throw new Error('운영 환경 필수 환경변수가 설정되지 않아 서버를 시작할 수 없습니다.');
  }

  return { warnings, errors };
}

/** CORS 허용 목록. 비어 있으면 null 을 돌려주고, 호출부가 "전체 허용"으로 처리합니다. */
export function getCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || '';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

export default { checkEnv, getCorsOrigins };
