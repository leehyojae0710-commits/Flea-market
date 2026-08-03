// backend/scripts/verify-my-booth-duplicate.js
// [점검 스크립트] 「내 부스 관리」의 중복 신청 마켓별 보기 기능을 확인합니다.
//
// 확인 내용
//   1) 파일 마커 — 배지 버튼화 / 마켓 목록 / 클릭 처리 / 스타일이 실제로 들어갔는지
//   2) 필터 로직 — 마켓을 골랐을 때 그 마켓의 중복 건만 남는지 (순수 함수로 재현)
//
// DB 도 서버도 필요 없습니다.
// 실행: cd backend && node scripts/verify-my-booth-duplicate.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function read(rel) {
  const p = path.join(projectRoot, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/* ------------------------------------------------------------------ */
console.log('\n[1] 파일 마커');

const MARKERS = [
  ['frontend/pages/B_host-seller/js/mybooth.js', 'let duplicateMarketId = null;', '마켓 선택 상태'],
  ['frontend/pages/B_host-seller/js/mybooth.js', 'dup-badge-btn', '배지를 버튼으로'],
  ['frontend/pages/B_host-seller/js/mybooth.js', 'dup-market-list', '중복 마켓 목록'],
  ['frontend/pages/B_host-seller/js/mybooth.js', 'handleDuplicateMarketClick', '클릭 처리'],
  ['frontend/pages/B_host-seller/js/mybooth.js', "data-action=\"dup-clear\"", '전체 보기 해제'],
  ['frontend/pages/B_host-seller/js/mybooth.js', 'e.stopPropagation();', '카드 펼치기로 새지 않게'],
  ['frontend/pages/B_host-seller/js/mybooth.js', 'const byMarket = duplicateMarketId', '마켓 필터 적용'],
  ['frontend/pages/B_host-seller/js/mybooth.js', '고른 마켓에 해당 상태의 중복 신청이 없어요', '빈 결과 안내'],
  ['frontend/pages/B_host-seller/mybooth.html', 'mybooth.js?v=', '캐시 버전 표기'],
  ['frontend/common/css/style.css', '.dup-market-item', '마켓 목록 스타일'],
  ['frontend/common/css/style.css', '.dup-picked', '선택 표시 스타일'],
];
for (const [file, marker, label] of MARKERS) {
  const body = read(file);
  if (body === null) { check(`${label} (${file})`, false, '파일 없음'); continue; }
  const norm = body.replace(/\r\n/g, '\n');
  check(`${label} — ${path.basename(file)}`, norm.includes(marker.replace(/\r\n/g, '\n')),
    `'${marker.slice(0, 34)}' 없음`);
}

/* ------------------------------------------------------------------ */
console.log('\n[2] 필터 동작');

// mybooth.js 의 applyStatusFilter 와 같은 규칙을 그대로 재현합니다.
const STATUS_FILTER_MAP = { Refund: ['Refunded', 'RefundRequested'] };

function filterApps(all, { statusFilter = '', duplicateOnly = false, duplicateMarketId = null }) {
  const grouped = STATUS_FILTER_MAP[statusFilter];
  const byStatus = statusFilter
    ? all.filter((a) => {
        const st = a.status || 'Pending';
        return grouped ? grouped.includes(st) : st === statusFilter;
      })
    : all;

  const byDuplicate = duplicateOnly
    ? byStatus.filter((a) => Number(a.marketDuplicateCount) >= 2)
    : byStatus;

  return duplicateMarketId
    ? byDuplicate.filter((a) => String(a.marketId) === String(duplicateMarketId)
        && Number(a.marketDuplicateCount) >= 2)
    : byDuplicate;
}

// 마켓 1: 중복 3건 / 마켓 2: 중복 2건 / 마켓 3: 단독 1건
const APPS = [
  { applicationId: 1, marketId: 1, marketTitle: '국방부 야시장', status: 'Paid', marketDuplicateCount: 3 },
  { applicationId: 2, marketId: 1, marketTitle: '국방부 야시장', status: 'Pending', marketDuplicateCount: 3 },
  { applicationId: 3, marketId: 1, marketTitle: '국방부 야시장', status: 'Approved', marketDuplicateCount: 3 },
  { applicationId: 4, marketId: 2, marketTitle: '22222', status: 'Approved', marketDuplicateCount: 2 },
  { applicationId: 5, marketId: 2, marketTitle: '22222', status: 'Pending', marketDuplicateCount: 2 },
  { applicationId: 6, marketId: 3, marketTitle: '단독 마켓', status: 'Pending', marketDuplicateCount: 1 },
];

let r = filterApps(APPS, {});
check('기본: 전체 6건', r.length === 6, String(r.length));

r = filterApps(APPS, { duplicateOnly: true });
check('중복만 보기: 5건 (단독 제외)', r.length === 5, String(r.length));
check('중복만 보기에 단독 마켓 없음', !r.some((a) => a.marketId === 3));

r = filterApps(APPS, { duplicateOnly: true, duplicateMarketId: 1 });
check('마켓1 선택: 3건', r.length === 3, String(r.length));
check('마켓1 것만 남음', r.every((a) => a.marketId === 1), JSON.stringify(r.map((a) => a.marketId)));

r = filterApps(APPS, { duplicateOnly: true, duplicateMarketId: 2 });
check('마켓2 선택: 2건', r.length === 2, String(r.length));

// 마켓 선택은 문자열로 넘어옵니다 (data-market-id 속성)
r = filterApps(APPS, { duplicateOnly: true, duplicateMarketId: '1' });
check('id 가 문자열이어도 동작', r.length === 3, String(r.length));

// 단독 마켓을 고를 일은 없지만, 골라도 중복 조건 때문에 0건이어야 합니다.
r = filterApps(APPS, { duplicateOnly: true, duplicateMarketId: 3 });
check('단독 마켓 선택 → 0건', r.length === 0, String(r.length));

// 상태 필터와 함께 걸리는지
r = filterApps(APPS, { duplicateOnly: true, duplicateMarketId: 1, statusFilter: 'Pending' });
check('마켓1 + 승인대기: 1건', r.length === 1 && r[0].applicationId === 2, JSON.stringify(r.map((a) => a.applicationId)));

r = filterApps(APPS, { duplicateOnly: true, duplicateMarketId: 1, statusFilter: 'Rejected' });
check('마켓1 + 반려: 0건 (안내 문구 대상)', r.length === 0);

// 마켓만 고르고 중복 체크는 꺼진 상태여도 중복 조건이 함께 걸려야 합니다.
r = filterApps(APPS, { duplicateOnly: false, duplicateMarketId: 3 });
check('중복 체크 꺼져도 단독은 안 나옴', r.length === 0, String(r.length));

/* ------------------------------------------------------------------ */
console.log('\n[3] 마켓 목록 집계');

function buildMarketList(all) {
  const map = new Map();
  all.forEach((a) => {
    const c = Number(a.marketDuplicateCount) || 0;
    if (c >= 2) map.set(String(a.marketId), { marketId: a.marketId, count: c, title: a.marketTitle });
  });
  return [...map.values()].sort((x, y) => y.count - x.count);
}

const list = buildMarketList(APPS);
check('중복 마켓 2곳', list.length === 2, String(list.length));
check('같은 마켓이 중복 집계되지 않음', new Set(list.map((v) => v.marketId)).size === list.length);
check('칸 수 많은 순 정렬', list[0].count >= list[1].count, JSON.stringify(list.map((v) => v.count)));
check('총 칸수 5', list.reduce((s2, v) => s2 + v.count, 0) === 5);

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
if (failures.length) { console.log('\n실패 목록:'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
