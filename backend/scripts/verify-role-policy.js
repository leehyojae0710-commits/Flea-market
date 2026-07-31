// backend/scripts/verify-role-policy.js
// [단방향 전환 규칙 검증] 판매자 -> 주최자 차단이 실제로 지켜지는지 자동 점검합니다.
//
// 실행
//   cd backend
//   node scripts/verify-role-policy.js                                   정적 점검만 (서버/DB 불필요)
//   node scripts/verify-role-policy.js --live --email=... --password=...  실서버 호출까지 점검
//
// 옵션
//   --live                 실제 서버에 판매자 계정으로 로그인해 주최자 API 를 호출해 봅니다.
//   --email / --password   기존 판매자 계정 정보. (계정을 새로 만들지 않으므로 DB 를 오염시키지 않습니다)
//   --base=http://...      API 주소. 기본값 http://localhost:5000/api
//
// 왜 필요한가
//   지금까지 단방향 규칙은 사람이 눈으로 확인하는 게 전부였습니다.
//   팀원이 주최자 API 를 새로 추가하면서 가드 등록을 빠뜨려도 아무도 모르는 상태라,
//   회귀를 잡아 줄 점검 수단을 둡니다. 배포 전에 한 번 돌리는 용도입니다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { HOST_ONLY_ENDPOINTS, matchesHostOnly, isHostType } from '../middleware/roleGuard.js';
import { normalizeActiveRole, hasTokenActiveRole } from '../utills/rolePolicy.js';
import { signAccessToken, verifyAccessToken } from '../utills/tokenService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');

/* ------------------------------------------------------------------ */
/* 아주 작은 테스트 러너                                               */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(detail ? `${label}\n       ${detail}` : label);
    console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
}

/* ------------------------------------------------------------------ */
/* 1. 역할 판정 규칙                                                   */
/* ------------------------------------------------------------------ */

function testRoleRules() {
  section('1. 역할 판정 규칙');

  check('판매자 계정은 activeRole 을 host 로 지정해도 seller 로 정규화된다',
    normalizeActiveRole(0, 'host') === 'seller',
    `실제: ${normalizeActiveRole(0, 'host')}`);

  check('주최자 계정의 activeRole 이 비어 있으면 host 로 본다',
    normalizeActiveRole(1, null) === 'host' && normalizeActiveRole(1, undefined) === 'host');

  check('주최자 계정은 seller 로 전환할 수 있다',
    normalizeActiveRole(1, 'seller') === 'seller');

  check('userType 이 문자열로 들어와도 판정이 흔들리지 않는다',
    isHostType('1') === true && isHostType('0') === false);

  // 토큰 위조 방어: 판매자 계정으로 host 역할을 서명하려 해도 payload 는 seller 가 된다.
  const forged = signAccessToken({ userId: 999, userType: 0, activeRole: 'host' });
  const decoded = verifyAccessToken(forged);
  check('판매자 토큰에는 activeRole=host 가 서명되지 않는다',
    decoded.ok && decoded.payload.activeRole === 'seller',
    `실제: ${decoded.ok ? decoded.payload.activeRole : decoded.code}`);

  check('구버전 토큰(activeRole 없음)을 구분할 수 있다',
    hasTokenActiveRole({ userId: 1, userType: 1 }) === false &&
    hasTokenActiveRole({ activeRole: 'host' }) === true);
}

/* ------------------------------------------------------------------ */
/* 2. 주최자 전용 API 가드 커버리지                                    */
/* ------------------------------------------------------------------ */

// 주최자 전용이어야 하는 API (기대값). 새 주최자 API 를 만들면 여기에도 추가하세요.
const EXPECTED_HOST_ONLY = [
  ['POST', '/markets', '마켓 등록'],
  ['GET', '/markets/mine', '내 마켓 목록'],
  ['PATCH', '/markets/12', '마켓 수정'],
  ['PATCH', '/markets/closed/12', '마켓 취소'],
  ['PATCH', '/markets/12/location', '마켓 위치 수정'],
  ['GET', '/markets/12/applications', '신청자 목록'],
  ['PATCH', '/applications/34/approve', '신청 승인'],
  ['PATCH', '/applications/34/reject', '신청 반려'],
  ['PUT', '/markets/12/layout', '부스 배치 저장'],
  ['GET', '/markets/12/settlement', '정산 조회'],
  ['PATCH', '/markets/12/settlement/notify', '정산 통보'],
  ['GET', '/markets/12/booths/A-1/queue', '부스 대기열 조회'],
  ['POST', '/markets/12/queue/process-timeouts', '대기열 타임아웃 처리'],
  ['GET', '/users/me/activity', '주최자 활동 통계'],
];

// 절대 막히면 안 되는 공개/판매자 API (오탐 방지)
const EXPECTED_ALLOWED = [
  ['GET', '/markets', '마켓 목록(공개)'],
  ['GET', '/markets/12', '마켓 상세(공개)'],
  ['GET', '/markets/12/layout', '부스 배치 조회(공개)'],
  ['POST', '/applications', '부스 신청(판매자)'],
  ['GET', '/applications/my', '내 신청 목록(판매자)'],
  ['PATCH', '/applications/34', '내 신청 수정(판매자)'],
  ['POST', '/payments/confirm', '결제 확인(판매자)'],
  ['GET', '/users/me/stats', '마이페이지 통계(공용)'],
  ['GET', '/users/me/profile', '내 프로필(공용)'],
];

function testGuardCoverage() {
  section('2. 주최자 전용 API 가드 커버리지');
  console.log(`  (등록된 규칙 ${HOST_ONLY_ENDPOINTS.length}건)`);

  for (const [method, url, label] of EXPECTED_HOST_ONLY) {
    check(`차단 O  ${method.padEnd(6)} ${url.padEnd(38)} ${label}`,
      matchesHostOnly(method, url),
      'roleGuard.HOST_ONLY_ENDPOINTS 에 규칙을 추가하세요.');
  }

  for (const [method, url, label] of EXPECTED_ALLOWED) {
    check(`통과 O  ${method.padEnd(6)} ${url.padEnd(38)} ${label}`,
      !matchesHostOnly(method, url),
      '공개/판매자 API 가 주최자 전용으로 잘못 등록됐습니다.');
  }
}

/* ------------------------------------------------------------------ */
/* 3. 프론트 화면 가드                                                 */
/* ------------------------------------------------------------------ */

function testFrontendGuard() {
  section('3. 프론트 주최자 전용 화면 가드');

  const routingPath = path.join(PROJECT_ROOT, 'frontend/common/js/role-routing.js');
  if (!fs.existsSync(routingPath)) {
    check('role-routing.js 존재', false, routingPath);
    return;
  }

  const routing = fs.readFileSync(routingPath, 'utf8');
  const block = routing.match(/HOST_ONLY_PAGES\s*=\s*\[([\s\S]*?)\]/);
  if (!block) {
    check('HOST_ONLY_PAGES 목록 파싱', false, 'role-routing.js 구조가 바뀐 것 같습니다.');
    return;
  }

  const pages = [...block[1].matchAll(/'([^']+\.html)'/g)].map((m) => m[1]);
  check(`HOST_ONLY_PAGES 목록을 읽었다 (${pages.length}건: ${pages.join(', ')})`, pages.length > 0);

  // 목록에 적힌 화면이 실제로 존재하고, 가드 스크립트를 불러오는지 확인합니다.
  const htmlFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith('.html')) htmlFiles.push(full);
    }
  };
  walk(path.join(PROJECT_ROOT, 'frontend'));

  for (const page of pages) {
    const found = htmlFiles.find((f) => path.basename(f).toLowerCase() === page.toLowerCase());
    if (!found) {
      check(`${page} 파일 존재`, false, '목록에는 있는데 파일이 없습니다. 이름이 바뀌었는지 확인하세요.');
      continue;
    }
    const html = fs.readFileSync(found, 'utf8');
    check(`${page} 가 role-routing.js 를 불러온다`,
      html.includes('role-routing.js'),
      '<head> 에 <script src="../../common/js/role-routing.js"></script> 를 추가하세요.');
  }
}

/* ------------------------------------------------------------------ */
/* 4. 실서버 점검 (--live)                                             */
/* ------------------------------------------------------------------ */

const GUARD_MESSAGE = '판매자 계정은 주최자 기능을 이용할 수 없습니다.';

// 존재하지 않는 marketId 를 씁니다.
// 가드가 정상이면 라우터에 닿기 전에 403 이 나가므로 데이터가 바뀌지 않습니다.
const LIVE_TARGETS = [
  ['POST', '/markets', '마켓 등록'],
  ['GET', '/markets/mine', '내 마켓 목록'],
  ['PATCH', '/markets/999999', '마켓 수정'],
  ['PATCH', '/markets/closed/999999', '마켓 취소'],
  ['PATCH', '/markets/999999/location', '마켓 위치 수정'],
  ['GET', '/markets/999999/applications', '신청자 목록'],
  ['PATCH', '/applications/999999/approve', '신청 승인'],
  ['PATCH', '/applications/999999/reject', '신청 반려'],
  ['PUT', '/markets/999999/layout', '부스 배치 저장'],
  ['GET', '/markets/999999/settlement', '정산 조회'],
  ['PATCH', '/markets/999999/settlement/notify', '정산 통보'],
  ['GET', '/markets/999999/booths/A-1/queue', '부스 대기열 조회'],
  ['POST', '/markets/999999/queue/process-timeouts', '대기열 타임아웃 처리'],
  ['GET', '/users/me/activity', '주최자 활동 통계'],
];

async function testLive(base, email, password) {
  section('4. 실서버 점검 (판매자 계정)');

  let login;
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    login = await res.json();
  } catch (error) {
    check('판매자 계정 로그인', false, `서버에 연결할 수 없습니다: ${error.message}`);
    return;
  }

  if (!login.success) {
    check('판매자 계정 로그인', false, login.message || '로그인 실패');
    return;
  }

  const user = login.data.user || {};
  if (Number(user.userType) !== 0) {
    check('판매자 계정으로 점검', false, '주최자 계정입니다. 판매자 계정 정보를 넣어 주세요.');
    return;
  }

  check('판매자 계정 로그인', true);
  check('로그인 응답의 activeRole 이 seller 다', login.data.activeRole === 'seller',
    `실제: ${login.data.activeRole}`);
  check('로그인 응답의 canBeHost 가 false 다', user.canBeHost === false,
    `실제: ${user.canBeHost}`);

  const token = login.data.token;
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 4-1. 역할 전환 차단
  const toggleRes = await fetch(`${base}/auth/toggle-role`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ activeRole: 'host' }),
  });
  const toggleJson = await toggleRes.json().catch(() => ({}));
  check('PATCH /auth/toggle-role 이 403 으로 차단된다',
    toggleRes.status === 403 && toggleJson.success === false,
    `실제: ${toggleRes.status} ${toggleJson.message || ''}`);

  // 4-2. 주최자 전용 API 순회
  for (const [method, url, label] of LIVE_TARGETS) {
    let status = 0;
    let message = '';
    try {
      const res = await fetch(`${base}${url}`, {
        method,
        headers: auth,
        body: method === 'GET' ? undefined : JSON.stringify({}),
      });
      status = res.status;
      const json = await res.json().catch(() => ({}));
      message = json.message || '';
    } catch (error) {
      message = error.message;
    }

    // 가드가 없으면 소유권 검사에 걸려 다른 메시지의 403 이 오거나 404 가 옵니다.
    // 메시지까지 확인해야 "가드가 막은 것"인지 구분할 수 있습니다.
    check(`${method.padEnd(6)} ${url.padEnd(42)} ${label}`,
      status === 403 && message === GUARD_MESSAGE,
      `실제: ${status} ${message}`);
  }
}

/* ------------------------------------------------------------------ */
/* 실행                                                                */
/* ------------------------------------------------------------------ */

function getArg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  console.log('\n═══ 단방향 전환 규칙 검증 (판매자 → 주최자 차단) ═══');

  testRoleRules();
  testGuardCoverage();
  testFrontendGuard();

  const live = process.argv.includes('--live');
  if (live) {
    const email = getArg('email');
    const password = getArg('password');
    const base = getArg('base', 'http://localhost:5000/api');

    if (typeof fetch !== 'function') {
      console.log('\n  ⚠️  Node 18 이상에서만 --live 를 쓸 수 있습니다. 정적 점검 결과만 표시합니다.');
    } else if (!email || !password) {
      console.log('\n  ⚠️  --email 과 --password 가 필요합니다. 정적 점검 결과만 표시합니다.');
      console.log('      예) node scripts/verify-role-policy.js --live --email=seller01@example.com --password=pw');
    } else {
      await testLive(base, email, password);
    }
  } else {
    console.log('\n  ℹ️  실서버 점검은 --live 옵션으로 실행합니다.');
    console.log('      node scripts/verify-role-policy.js --live --email=판매자계정 --password=비밀번호');
  }

  console.log(`\n═══ 결과: 통과 ${passed}건 / 실패 ${failures.length}건 ═══`);
  if (failures.length > 0) {
    console.log('\n실패 항목');
    failures.forEach((f) => console.log(`  ❌ ${f}`));
    process.exitCode = 1;
  } else {
    console.log('\n🎉 단방향 전환 규칙이 모두 지켜지고 있습니다.');
  }
}

main()
  .catch((error) => {
    console.error('점검 중 오류:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    // db.js 가 만든 커넥션 풀 때문에 프로세스가 남지 않도록 정리합니다.
    setTimeout(() => process.exit(process.exitCode || 0), 100).unref();
  });
