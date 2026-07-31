// backend/scripts/verify-application-policy.js
// [부스 신청 정합성] 검증 스크립트
//
// 실행: cd backend && node scripts/verify-application-policy.js
//       (DB·서버 없이 돌아갑니다. 가짜 DB를 주입해 판정 로직만 검사합니다.)
//
// 두 가지를 확인합니다.
//   1) 패치가 4개 파일에 빠짐없이 적용됐는지 (zip 부분 적용 사고 방지)
//   2) 신청 자격 판정 13가지 시나리오가 기대대로 동작하는지
//
// 관련 WBS: 3.2.2.4 / 3.2.2.5 / 3.2.2.6 / 3.11.6.1 / 3.11.6.2, 4.3 단위 테스트

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkBoothApplyEligibility } from '../utills/applicationPolicy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');

let pass = 0;
const fails = [];

function check(label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fails.push(label + (detail ? ` — ${detail}` : ''));
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/* 1. 패치 적용 확인                                                   */
/* ------------------------------------------------------------------ */

const MARKERS = [
  ['utills/applicationPolicy.js', 'export async function checkBoothApplyEligibility', '신청 자격 판정 모듈(신규)'],
  ['controllers/applicationController.js', 'beginTransaction', '신청 등록 트랜잭션 + 부스 잠금'],
  ['controllers/applicationController.js', 'excludeApplicationId: application.applicationId', '신청 수정 경로 우회 차단'],
  ['controllers/payController.js', 'SELF_MARKET_REFUND_FORBIDDEN', '본인 마켓 환불 요청 차단'],
  ['routes/applicationRoutes.js', 'DUPLICATE_APPLICATION', 'Swagger 오류 코드 문서화'],
];

console.log('\n═══ 부스 신청 정합성 검증 ═══');
console.log('\n── 1. 패치 적용 확인 ─────────────────────────────────────');

for (const [rel, marker, label] of MARKERS) {
  const full = path.join(BACKEND_ROOT, rel);
  if (!fs.existsSync(full)) {
    check(`${rel} — ${label}`, false, '파일 없음');
    continue;
  }
  check(`${rel} — ${label}`, fs.readFileSync(full, 'utf8').includes(marker), '마커 없음');
}

/* ------------------------------------------------------------------ */
/* 2. 판정 로직 시나리오                                               */
/* ------------------------------------------------------------------ */

const COLUMNS = [
  'marketId', 'hostId', 'isExpired', 'title', 'maxparticipants', 'allowOvercapacity',
  'allowDuplicateApplication', 'eventDate_min', 'eventDate_max', 'recruitmentDate_min', 'recruitmentDate_max',
];

// 실제 DB 대신 정해진 답만 돌려주는 가짜 커넥션.
// 플레이스홀더(?) 개수와 파라미터 개수가 어긋나면 여기서 바로 잡힙니다.
function makeFakeDb({ market, taken = [], occupied = 0, conflict = [], sellerApplications = [] }) {
  return {
    async query(sql, params = []) {
      const placeholders = (sql.match(/\?/g) || []).length;
      if (placeholders !== params.length) {
        throw new Error(`플레이스홀더 ${placeholders}개 vs 파라미터 ${params.length}개`);
      }
      if (sql.includes('information_schema')) return [COLUMNS.map((c) => ({ c }))];
      if (sql.includes('FROM markets WHERE marketId')) return [market ? [market] : []];
      if (sql.includes('SELECT applicationId, sellerId FROM applications')) return [taken];
      if (sql.includes('SELECT applicationId FROM applications')) return [sellerApplications];
      if (sql.includes('COUNT(*) AS cnt')) return [[{ cnt: occupied }]];
      if (sql.includes('JOIN markets m ON m.marketId = a.marketId')) return [conflict];
      throw new Error('예상치 못한 쿼리: ' + sql.slice(0, 60));
    },
  };
}

const 오늘 = new Date();
const 며칠뒤 = (n) => new Date(오늘.getFullYear(), 오늘.getMonth(), 오늘.getDate() + n);

const 기준마켓 = {
  marketId: 5,
  hostId: 99,
  isExpired: 0,
  title: '테스트 마켓',
  maxparticipants: 10,
  eventDate_min: 며칠뒤(30),
  eventDate_max: 며칠뒤(31),
  recruitmentDate_min: 며칠뒤(-10),
  recruitmentDate_max: 며칠뒤(10),
};

const 시나리오 = [
  ['정상 신청', { market: 기준마켓 }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, true, null],
  ['본인이 주최한 마켓', { market: 기준마켓 }, { userId: 99, marketId: 5, boothNumber: 'A-1' }, false, 'SELF_APPLY_FORBIDDEN'],
  ['없는 마켓', { market: null }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'MARKET_NOT_FOUND'],
  ['마감된 마켓', { market: { ...기준마켓, isExpired: 1 } }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'MARKET_CLOSED'],
  ['취소된 마켓', { market: { ...기준마켓, isExpired: 2 } }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'MARKET_CANCELLED'],
  ['모집 시작 전', { market: { ...기준마켓, recruitmentDate_min: 며칠뒤(5) } }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'RECRUITMENT_NOT_STARTED'],
  ['모집 마감 후', { market: { ...기준마켓, recruitmentDate_max: 며칠뒤(-1) } }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'RECRUITMENT_CLOSED'],
  ['내가 이미 신청한 부스', { market: 기준마켓, taken: [{ applicationId: 3, sellerId: 7 }] }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'DUPLICATE_APPLICATION'],
  ['남이 점유한 부스', { market: 기준마켓, taken: [{ applicationId: 3, sellerId: 8 }] }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'BOOTH_TAKEN'],
  ['남이 점유한 부스 + 초과 허용 + 행사 전', { market: { ...기준마켓, allowOvercapacity: 1 }, taken: [{ applicationId: 3, sellerId: 8 }] }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, true, null],
  ['남이 점유한 부스 + 초과 허용 + 행사 시작 후', { market: { ...기준마켓, allowOvercapacity: 1, eventDate_min: 며칠뒤(-1) }, taken: [{ applicationId: 3, sellerId: 8 }] }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'BOOTH_TAKEN'],
  ['내가 이미 신청한 부스 + 초과 허용', { market: { ...기준마켓, allowOvercapacity: 1 }, taken: [{ applicationId: 3, sellerId: 7 }] }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'DUPLICATE_APPLICATION'],
  ['정원 초과', { market: { ...기준마켓, maxparticipants: 2 }, occupied: 2 }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'CAPACITY_FULL'],
  ['정원 초과 + 허용 안함', { market: { ...기준마켓, maxparticipants: 2, allowOvercapacity: 0 }, occupied: 2 }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'CAPACITY_FULL'],
  ['정원 초과 + 허용 + 행사 전', { market: { ...기준마켓, maxparticipants: 2, allowOvercapacity: 1 }, occupied: 2 }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, true, null],
  ['정원 초과 + 허용 + 행사 시작 후', { market: { ...기준마켓, maxparticipants: 2, allowOvercapacity: 1, eventDate_min: 며칠뒤(-1) }, occupied: 2 }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, false, 'CAPACITY_FULL'],
  ['개최일 겹치는 마켓에 이미 신청 (정책상 항상 허용)', { market: 기준마켓, conflict: [{ marketId: 9, title: '다른 마켓' }] }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, true, null],
  ['1인 다부스 (정원 여유)', { market: 기준마켓, occupied: 3 }, { userId: 7, marketId: 5, boothNumber: 'B-2' }, true, null],
  ['신청 수정 (자기 건은 계산에서 제외)', { market: 기준마켓, occupied: 0 }, { userId: 7, marketId: 5, boothNumber: 'B-9', excludeApplicationId: 12 }, true, null],
  ['중복 신청 허용 안함 + 이미 신청한 판매자', { market: { ...기준마켓, allowDuplicateApplication: 0 }, sellerApplications: [{ applicationId: 3 }] }, { userId: 7, marketId: 5, boothNumber: 'B-2' }, false, 'DUPLICATE_SELLER_APPLICATION'],
  ['중복 신청 허용 안함 + 처음 신청하는 판매자', { market: { ...기준마켓, allowDuplicateApplication: 0 }, sellerApplications: [] }, { userId: 7, marketId: 5, boothNumber: 'A-1' }, true, null],
  ['중복 신청 허용(기본값) + 이미 신청한 판매자의 다른 부스 신청', { market: 기준마켓, sellerApplications: [{ applicationId: 3 }] }, { userId: 7, marketId: 5, boothNumber: 'B-2' }, true, null],
  ['중복 신청 허용 안함 + 신청 수정(자기 건은 계산에서 제외)', { market: { ...기준마켓, allowDuplicateApplication: 0 }, sellerApplications: [] }, { userId: 7, marketId: 5, boothNumber: 'A-1', excludeApplicationId: 12 }, true, null],
];

console.log('\n── 2. 신청 자격 판정 시나리오 ────────────────────────────');

for (const [label, dbOpts, args, 기대ok, 기대code] of 시나리오) {
  try {
    const r = await checkBoothApplyEligibility(makeFakeDb(dbOpts), args);
    const ok = r.ok === 기대ok && (기대ok || r.code === 기대code);
    check(`${label} → ${r.ok ? '통과' : r.code}`, ok, ok ? '' : `기대 ${기대ok ? '통과' : 기대code}`);
  } catch (error) {
    check(label, false, `예외: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */

console.log(`\n═══ 결과: 통과 ${pass}건 / 실패 ${fails.length}건 ═══`);
if (fails.length > 0) {
  console.log('\n실패 항목');
  fails.forEach((f) => console.log(`  ❌ ${f}`));
  process.exitCode = 1;
} else {
  console.log('\n🎉 부스 신청 정합성 검증을 모두 통과했습니다.');
}
