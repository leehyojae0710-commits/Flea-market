// backend/scripts/verify-market-options.js
// [점검 스크립트] 「최대 허용 부스 초과 허용」 / 「부스 신청 중복 허용」 두 옵션이
//                마켓 등록·수정 양쪽에 제대로 붙었는지 확인합니다.
//
// DB 도 서버도 필요 없습니다. 파일 마커 검사 + 순수 함수 시나리오 검사만 합니다.
//
// 실행: cd backend && node scripts/verify-market-options.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  toFlag,
  resolveMarketOptions,
  buildInsertOptions,
  buildUpdateOptions,
  describeSkippedOptions,
  resetMarketOptionColumnCache,
} from '../utills/marketOptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function read(rel, base = projectRoot) {
  const p = path.join(base, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/* ------------------------------------------------------------------ */
console.log('\n[1] 파일 마커 검사');
/* ------------------------------------------------------------------ */

const MARKERS = [
  ['backend/utills/marketOptions.js', 'buildInsertOptions', '등록용 옵션 빌더'],
  ['backend/utills/marketOptions.js', 'buildUpdateOptions', '수정용 옵션 빌더'],
  ['backend/utills/marketOptions.js', 'MISSING_TTL_MS', '컬럼 없음 캐시 TTL'],
  ['backend/controllers/marketController.js', "from '../utills/marketOptions.js'", '컨트롤러 import'],
  ['backend/controllers/marketController.js', 'buildInsertOptions(pool, req.body)', '등록에서 옵션 반영'],
  ['backend/controllers/marketController.js', 'buildUpdateOptions(pool, req.body)', '수정에서 옵션 반영'],
  ['backend/controllers/marketController.js', 'INSERT INTO markets (${columns.join', '동적 INSERT'],
  ['backend/controllers/marketController.js', 'optionsSkipped', '미저장 옵션 응답'],
  ['backend/routes/marketRoutes.js', 'allowOvercapacity: { type: boolean', 'POST swagger'],
  ['backend/routes/marketRoutes.js', 'allowOvercapacity:\n *                 type: boolean', 'PATCH swagger'],
  ['backend/scripts/migrate-add-market-options.js', 'allowDuplicateApplication TINYINT(1)', '통합 마이그레이션'],
  ['backend/scripts/migrate-add-market-duplicate-application.js', "? ' AFTER allowOvercapacity' : ''", 'AFTER 절 조건부화'],
  ['frontend/pages/B_host-seller/market-create.html', 'id="allow-overcapacity"', '등록 화면 초과 허용 체크박스'],
  ['frontend/pages/B_host-seller/market-create.html', 'id="allow-duplicate-application"', '등록 화면 중복 허용 체크박스'],
  ['frontend/pages/B_host-seller/market-create.html', 'market.js?v=', '등록 스크립트 캐시 버전 표기'],
  ['frontend/pages/B_host-seller/correctionMarket.html', 'id="allow-overcapacity"', '수정 화면 초과 허용 체크박스'],
  ['frontend/pages/B_host-seller/correctionMarket.html', 'id="allow-duplicate-application" style="width:auto;" checked', '수정 화면 중복 허용 기본 checked'],
  ['frontend/pages/B_host-seller/correctionMarket.html', 'marketcorrection.js?v=', '수정 스크립트 캐시 버전 표기'],
  ['frontend/pages/B_host-seller/js/market.js', "allowOvercapacity: document.getElementById('allow-overcapacity')", '등록 payload 에 초과 허용'],
  ['frontend/pages/B_host-seller/js/market.js', 'optionsSkipped', '등록 화면 미저장 안내'],
  ['frontend/pages/B_host-seller/js/marketcorrection.js', 'optionsSkipped', '수정 화면 미저장 안내'],
  ['frontend/pages/B_host-seller/js/marketcorrection.js', 'market.maxparticipants', '최대 부스 수 표기 보정'],
];

for (const [file, marker, label] of MARKERS) {
  const body = read(file);
  if (body === null) { check(`${label} (${file})`, false, '파일 없음'); continue; }
  check(`${label} — ${path.basename(file)}`, body.includes(marker), `'${marker.slice(0, 40)}' 없음`);
}

/* ------------------------------------------------------------------ */
console.log('\n[2] 값 해석(toFlag) 검사');
/* ------------------------------------------------------------------ */

const FLAG_CASES = [
  [true, 1], [false, 0], [1, 1], [0, 0],
  ['1', 1], ['0', 0], ['true', 1], ['false', 0],
  ['on', 1], ['off', 0], ['TRUE', 1],
  [undefined, null], [null, null], ['', null], ['알수없음', null],
];
for (const [input, expected] of FLAG_CASES) {
  const got = toFlag(input);
  check(`toFlag(${JSON.stringify(input)}) = ${expected}`, got === expected, `실제 ${got}`);
}

/* ------------------------------------------------------------------ */
console.log('\n[3] 기본값 검사 (등록 vs 수정)');
/* ------------------------------------------------------------------ */

const createDefaults = resolveMarketOptions({}, { useDefaults: true });
check('등록: 초과 허용 기본값 0', createDefaults.allowOvercapacity === 0);
check('등록: 중복 허용 기본값 1', createDefaults.allowDuplicateApplication === 1);

const updateNothing = resolveMarketOptions({}, { useDefaults: false });
check('수정: 안 보낸 옵션은 건드리지 않음', Object.keys(updateNothing).length === 0);

const updateOff = resolveMarketOptions({ allowDuplicateApplication: false }, { useDefaults: false });
check('수정: 체크 해제(false)는 0 으로 저장', updateOff.allowDuplicateApplication === 0);
check('수정: 안 보낸 초과 허용은 미포함', !('allowOvercapacity' in updateOff));

/* ------------------------------------------------------------------ */
console.log('\n[4] SQL 조각 생성 검사 (컬럼 유무별)');
/* ------------------------------------------------------------------ */

// information_schema 응답을 흉내 내는 가짜 db
function fakeDb(columns) {
  return { query: async () => [columns.map((c) => ({ c }))] };
}
const 전체컬럼 = ['marketId', 'title', 'maxparticipants', 'allowOvercapacity', 'allowDuplicateApplication'];
const 옵션없음 = ['marketId', 'title', 'maxparticipants'];
const 하나만 = ['marketId', 'title', 'maxparticipants', 'allowOvercapacity'];

async function sqlChecks() {
  // 4-1) 컬럼이 다 있을 때 등록
  resetMarketOptionColumnCache();
  let r = await buildInsertOptions(fakeDb(전체컬럼), { allowOvercapacity: true, allowDuplicateApplication: false });
  check('등록/컬럼O: 컬럼 2개 포함', r.columns.length === 2, JSON.stringify(r.columns));
  check('등록/컬럼O: 값 [1, 0]', r.values.join(',') === '1,0', r.values.join(','));
  check('등록/컬럼O: skipped 없음', r.skipped.length === 0);

  // 4-2) 컬럼이 없을 때 등록 → INSERT 에서 빠지고 skipped 로 보고
  resetMarketOptionColumnCache();
  r = await buildInsertOptions(fakeDb(옵션없음), { allowOvercapacity: true, allowDuplicateApplication: false });
  check('등록/컬럼X: INSERT 컬럼 0개 (500 방지)', r.columns.length === 0);
  check('등록/컬럼X: skipped 2건 보고', r.skipped.length === 2, JSON.stringify(r.skipped));
  check('등록/컬럼X: 안내 문구 생성', describeSkippedOptions(r.skipped).includes('migrate-add-market-options'));

  // 4-3) 컬럼이 하나만 있을 때 등록
  resetMarketOptionColumnCache();
  r = await buildInsertOptions(fakeDb(하나만), { allowOvercapacity: true, allowDuplicateApplication: false });
  check('등록/컬럼 일부: 있는 컬럼만 저장', r.columns.join(',') === 'allowOvercapacity', r.columns.join(','));
  check('등록/컬럼 일부: 없는 것만 skipped', r.skipped.join(',') === 'allowDuplicateApplication', r.skipped.join(','));

  // 4-4) 컬럼이 다 있을 때 수정
  resetMarketOptionColumnCache();
  r = await buildUpdateOptions(fakeDb(전체컬럼), { allowOvercapacity: false, allowDuplicateApplication: true });
  check('수정/컬럼O: SET 2개', r.fields.length === 2, JSON.stringify(r.fields));
  check('수정/컬럼O: 값 [0, 1]', r.values.join(',') === '0,1', r.values.join(','));

  // 4-5) 옵션을 아예 안 보낸 수정 (제목만 바꾸는 경우)
  resetMarketOptionColumnCache();
  r = await buildUpdateOptions(fakeDb(전체컬럼), { title: '새 이름' });
  check('수정: 옵션 미전송이면 SET 없음', r.fields.length === 0 && r.skipped.length === 0);

  // 4-6) 컬럼 없는 DB에서 수정 → 나머지 필드는 살아야 하므로 fields 비고 skipped 보고
  resetMarketOptionColumnCache();
  r = await buildUpdateOptions(fakeDb(옵션없음), { allowOvercapacity: true });
  check('수정/컬럼X: SET 없음 + skipped 1건', r.fields.length === 0 && r.skipped.length === 1);

  // 4-7) information_schema 조회 실패 시 "전부 있다"로 가정 (기존 동작 유지)
  resetMarketOptionColumnCache();
  const brokenDb = { query: async () => { throw new Error('권한 없음'); } };
  r = await buildInsertOptions(brokenDb, { allowOvercapacity: true });
  check('조회 실패 시 기존 동작 유지(컬럼 있다고 가정)', r.columns.length === 2 && r.skipped.length === 0);

  resetMarketOptionColumnCache();
}

/* ------------------------------------------------------------------ */
await sqlChecks();

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
if (fail > 0) {
  console.log('\n실패 항목이 있으면 패치가 일부 폴더만 덮어써졌을 가능성이 큽니다.');
  console.log('zip 안의 backend/ 와 frontend/ 를 각각 다시 덮어써 주세요.');
}
process.exit(fail > 0 ? 1 : 0);
