// backend/scripts/verify-booth-types.js
// [점검 스크립트] 부스 종류(A/B/C) 기능이 등록·수정·신청·결제 전 구간에 붙었는지 확인합니다.
// DB 도 서버도 필요 없습니다. 파일 마커 검사 + 순수 함수 시나리오 검사만 합니다.
//
// 실행: cd backend && node scripts/verify-booth-types.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  MAX_BOOTH_TYPES, BOOTH_TYPE_LABELS, boothTypeLabel,
  normalizeBoothTypes, boothTypePriceSql, resolveBoothTypeForApply,
  attachBoothTypes, resetBoothTypeCache, saveBoothTypes, lockApprovedPrice, getBoothTypeReadiness,
} from '../utills/boothTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function read(rel) {
  const p = path.join(projectRoot, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

/* ------------------------------------------------------------------ */
console.log('\n[1] 파일 마커 검사');
/* ------------------------------------------------------------------ */

const MARKERS = [
  ['backend/utills/boothTypes.js', 'BOOTH_TYPE_LABELS', 'A/B/C 라벨 정의'],
  ['backend/utills/boothTypes.js', 'resolveBoothTypeForApply', '신청 시 종류 검증'],
  ['backend/utills/boothTypes.js', 'boothTypePriceSql', '가격 계산 SQL 조각'],
  ['backend/utills/boothTypes.js', 'BOOTH_TYPE_IN_USE', '신청자 있는 종류 삭제 차단'],
  ['backend/utills/boothTypes.js', 'lockApprovedPrice', '승인 시 금액 고정'],
  ['backend/controllers/applicationController.js', 'lockApprovedPrice(pool, applicationId)', '승인 시 고정 호출'],
  ['backend/scripts/migrate-add-booth-types.js', 'ADD COLUMN approvedPrice', '고정 금액 컬럼'],
  ['backend/scripts/migrate-add-booth-types.js', "status IN ('Approved', 'Paid')", '기존 승인건 백필'],
  ['frontend/pages/B_host-seller/js/mybooth.js', 'price-locked-chip', '확정 배지'],
  ['backend/utills/boothTypes.js', 'countApplicationsByType', '종류별 신청 건수'],
  ['backend/controllers/marketController.js', 'boothTypeResult.ok === false', '삭제 차단 응답 전달'],
  ['frontend/common/js/booth-types.js', 'booth-type-stop-input', '신규 신청 중단 토글'],
  ['frontend/common/js/booth-types.js', 'canRemove = total > 1 && index === total - 1 && !locked', '삭제 조건'],
  ['frontend/common/css/style.css', '.booth-type-locked', '삭제 잠김 스타일'],
  ['backend/scripts/migrate-add-booth-types.js', 'CREATE TABLE market_booth_types', '테이블 생성'],
  ['backend/scripts/migrate-add-booth-types.js', 'ADD COLUMN boothTypeId', '신청 컬럼 추가'],
  ['backend/controllers/marketController.js', 'normalizeBoothTypes(req.body.boothTypes)', '등록·수정에서 종류 수신'],
  ['backend/controllers/marketController.js', 'saveBoothTypes(pool, marketId', '수정에서 종류 저장'],
  ['backend/controllers/marketController.js', 'attachBoothTypes(pool, rows)', '목록·상세에 종류 첨부'],
  ['backend/controllers/applicationController.js', 'resolveBoothTypeForApply', '신청 시 종류 검증 호출'],
  ['backend/controllers/applicationController.js', 'AS boothTypeName', '내 신청 목록에 종류명'],
  ['backend/controllers/payController.js', 'boothTypePriceSql', '결제 금액을 종류 가격으로'],
  ['frontend/common/js/booth-types.js', 'window.BoothTypes', '공통 모듈 노출'],
  ['frontend/common/js/booth-types.js', "LABELS = ['A', 'B', 'C']", '화면도 A/B/C'],
  ['frontend/common/js/booth-types.js', 'renderOptions', '신청 select 옵션'],
  ['frontend/index.html', 'booth-types.js', '메인 페이지 로드'],
  ['frontend/pages/A_auth-main/js/main.js', 'renderBoothTypeBlock', '메인 카드에 종류 표시'],
  ['frontend/pages/A_auth-main/js/main.js', 'getBoothTypeChanges', '종류별 금액 변동 표시'],
  ['frontend/pages/B_host-seller/market-create.html', 'booth-type-rows', '등록 화면 편집 UI'],
  ['frontend/pages/B_host-seller/market-create.html', 'booth-type-add-btn', '등록 화면 부스 추가 버튼'],
  ['frontend/pages/B_host-seller/correctionMarket.html', 'booth-type-rows', '수정 화면 편집 UI'],
  ['frontend/pages/B_host-seller/booth-apply.html', 'id="booth-type"', '신청 화면 종류 선택'],
  ['frontend/pages/B_host-seller/js/market.js', 'loadBoothTypeChoices', '신청 화면 종류 로드'],
  ['frontend/pages/B_host-seller/js/market.js', 'boothTypeId: usesBoothTypes', '신청 payload'],
  ['frontend/pages/B_host-seller/js/marketcorrection.js', 'BoothTypes?.setTypes', '수정 화면 기존값 채우기'],
  ['frontend/pages/B_host-seller/js/mybooth.js', 'a.boothTypeName', '내 부스 목록 종류 표시'],
  ['frontend/common/css/style.css', '.booth-type-row', '편집 UI 스타일'],
  ['frontend/common/css/style.css', '.booth-type-chip', '표시용 스타일'],
];

for (const [file, marker, label] of MARKERS) {
  const body = read(file);
  if (body === null) { check(`${label} (${file})`, false, '파일 없음'); continue; }
  check(`${label} — ${path.basename(file)}`, body.includes(marker), `'${marker.slice(0, 40)}' 없음`);
}

/* ------------------------------------------------------------------ */
console.log('\n[2] 이름 자동 부여 (A → B → C)');
/* ------------------------------------------------------------------ */

check('최대 3개', MAX_BOOTH_TYPES === 3);
check('라벨은 A/B/C', BOOTH_TYPE_LABELS.join('') === 'ABC');
check('0번째 = A', boothTypeLabel(0) === 'A');
check('2번째 = C', boothTypeLabel(2) === 'C');
check('3번째는 없음', boothTypeLabel(3) === null);

const three = normalizeBoothTypes([{ price: 30000 }, { price: '50000' }, { price: 80000 }]);
check('세 칸이 순서대로 A/B/C', three.ok && three.list.map((t) => t.name).join('') === 'ABC',
  JSON.stringify(three.list?.map((t) => t.name)));
check('가격이 그대로 들어감', three.ok && three.list.map((t) => t.price).join(',') === '30000,50000,80000');

const ignored = normalizeBoothTypes([{ name: '프리미엄', price: 1000 }]);
check('클라이언트가 보낸 이름은 무시하고 A로 덮어씀', ignored.ok && ignored.list[0].name === 'A');

const gap = normalizeBoothTypes([{ price: 1000 }, { price: '' }, { price: 3000 }]);
check('빈 칸은 버리고 앞으로 당겨 A/B', gap.ok && gap.list.map((t) => t.name).join('') === 'AB');

const keepId = normalizeBoothTypes([{ boothTypeId: 7, price: 1000 }]);
check('기존 종류의 boothTypeId 유지', keepId.ok && keepId.list[0].boothTypeId === 7);

/* ------------------------------------------------------------------ */
console.log('\n[3] 입력값 검증');
/* ------------------------------------------------------------------ */

check('미전송이면 건드리지 않음(list=null)', normalizeBoothTypes(undefined).list === null);
check('빈 배열 = 종류 없는 마켓', JSON.stringify(normalizeBoothTypes([]).list) === '[]');
check('배열이 아니면 거부', normalizeBoothTypes({ price: 1 }).ok === false);
check('4개는 거부', normalizeBoothTypes([{ price: 1 }, { price: 2 }, { price: 3 }, { price: 4 }]).ok === false);
check('음수 가격 거부', normalizeBoothTypes([{ price: -100 }]).ok === false);
check('소수점 가격 거부', normalizeBoothTypes([{ price: 1000.5 }]).ok === false);
check('0원은 허용(무료 부스)', normalizeBoothTypes([{ price: 0 }]).ok === true);
const tooBig = normalizeBoothTypes([{ price: 999999999 }]);
check('비정상적으로 큰 금액 거부', tooBig.ok === false, tooBig.message);

/* ------------------------------------------------------------------ */
console.log('\n[4] 스키마 미적용 DB에서의 안전성');
/* ------------------------------------------------------------------ */

function fakeDb({ table = false, column = false, lockColumn = false, types = [] } = {}) {
  return {
    async query(sql) {
      if (sql.includes('information_schema.tables')) return [[{ cnt: table ? 1 : 0 }]];
      if (sql.includes('information_schema.columns')) {
        const cols = [];
        if (column) cols.push({ c: 'boothTypeId' });
        if (lockColumn) cols.push({ c: 'approvedPrice' });
        return [cols];
      }
      if (sql.includes('FROM market_booth_types')) return [types];
      return [[]];
    },
  };
}

await (async () => {
  // 마이그레이션 전: 기존 동작(마켓 기본 부스료)로 폴백해야 함
  resetBoothTypeCache();
  let sqlFrag = await boothTypePriceSql(fakeDb({ table: false, column: false }));
  check('스키마 없음: JOIN 없음', sqlFrag.join === '');
  check('스키마 없음: 마켓 기본가 사용', sqlFrag.priceExpr === 'm.boothPrice');
  check('스키마 없음: ready=false', sqlFrag.ready === false);

  resetBoothTypeCache();
  const rows = [{ marketId: 1 }, { marketId: 2 }];
  await attachBoothTypes(fakeDb({ table: false }), rows);
  check('스키마 없음: boothTypes 는 빈 배열', rows.every((r) => Array.isArray(r.boothTypes) && r.boothTypes.length === 0));

  resetBoothTypeCache();
  const noSchema = await resolveBoothTypeForApply(fakeDb({ table: false, column: false }), { marketId: 1, boothTypeId: 99 });
  check('스키마 없음: 신청은 그대로 통과', noSchema.ok === true && noSchema.boothType === null);

  // 마이그레이션 후
  resetBoothTypeCache();
  sqlFrag = await boothTypePriceSql(fakeDb({ table: true, column: true }));
  check('스키마 있음: LEFT JOIN 생성', sqlFrag.join.includes('LEFT JOIN market_booth_types'));
  check('스키마 있음: 종류가 → 마켓가 폴백', sqlFrag.priceExpr === 'COALESCE(bt.price, m.boothPrice)', sqlFrag.priceExpr);
})();

/* ------------------------------------------------------------------ */
console.log('\n[5] 신청 시 종류 검증');
/* ------------------------------------------------------------------ */

const TYPES = [
  { boothTypeId: 11, marketId: 5, name: 'A', price: 30000, sortOrder: 0, isActive: 1 },
  { boothTypeId: 12, marketId: 5, name: 'B', price: 50000, sortOrder: 1, isActive: 1 },
];

await (async () => {
  resetBoothTypeCache();
  let r = await resolveBoothTypeForApply(fakeDb({ table: true, column: true, types: TYPES }), { marketId: 5, boothTypeId: 12 });
  check('올바른 종류 선택 → 통과', r.ok === true && r.boothType?.price === 50000);

  resetBoothTypeCache();
  r = await resolveBoothTypeForApply(fakeDb({ table: true, column: true, types: TYPES }), { marketId: 5, boothTypeId: null });
  check('종류 쓰는 마켓인데 미선택 → 거부', r.ok === false && r.code === 'BOOTH_TYPE_REQUIRED');

  resetBoothTypeCache();
  r = await resolveBoothTypeForApply(fakeDb({ table: true, column: true, types: TYPES }), { marketId: 5, boothTypeId: 999 });
  check('남의 마켓 종류 선택 → 거부', r.ok === false && r.code === 'BOOTH_TYPE_NOT_FOUND');

  resetBoothTypeCache();
  r = await resolveBoothTypeForApply(fakeDb({ table: true, column: true, types: [] }), { marketId: 5, boothTypeId: 12 });
  check('종류 안 쓰는 마켓 → 선택값 무시하고 통과', r.ok === true && r.boothType === null);

  resetBoothTypeCache();
})();

/* ------------------------------------------------------------------ */
console.log('\n[6] 부스 삭제 차단 / 신규 신청 중단');
/* ------------------------------------------------------------------ */

// 저장 경로용 가짜 DB — 기존 종류 2개(A는 신청 2건, B는 0건)
function saveDb({ existing, counts }) {
  const executed = [];
  return {
    executed,
    async query(sql, params) {
      if (sql.includes('information_schema.tables')) return [[{ cnt: 1 }]];
      if (sql.includes('information_schema.columns')) {
        return [[{ c: 'boothTypeId' }, { c: 'approvedPrice' }]];
      }
      if (sql.includes('SELECT boothTypeId, name FROM market_booth_types')) return [existing];
      if (sql.includes('COUNT(*) AS cnt') && sql.includes('GROUP BY boothTypeId')) {
        return [counts.map(([id, cnt]) => ({ boothTypeId: id, cnt }))];
      }
      executed.push({ sql: sql.trim().split('\n')[0], params });
      if (sql.includes('INSERT INTO market_booth_types')) return [{ insertId: 99 }];
      return [[]];
    },
  };
}

const EXISTING = [{ boothTypeId: 21, name: 'A' }, { boothTypeId: 22, name: 'B' }];
const COUNTS = [[21, 2]]; // A 에만 신청 2건

await (async () => {
  // 6-1) 신청자 있는 A 를 목록에서 빼면 → 저장 거부
  resetBoothTypeCache();
  let db = saveDb({ existing: EXISTING, counts: COUNTS });
  let r = await saveBoothTypes(db, 5, [{ boothTypeId: 22, name: 'A', price: 1000, sortOrder: 0, isActive: 1 }]);
  check('신청자 있는 종류 삭제 → 거부', r.ok === false && r.code === 'BOOTH_TYPE_IN_USE', JSON.stringify(r));
  check('거부 메시지에 건수 표기', r.ok === false && r.message.includes('2건'));
  check('거부 시 DELETE 안 함', !db.executed.some((e) => e.sql.includes('DELETE')));

  // 6-2) 신청 0건인 B 만 빼면 → 정상 삭제
  resetBoothTypeCache();
  db = saveDb({ existing: EXISTING, counts: COUNTS });
  r = await saveBoothTypes(db, 5, [{ boothTypeId: 21, name: 'A', price: 1000, sortOrder: 0, isActive: 1 }]);
  check('신청 0건인 종류 삭제 → 허용', r.ok === true && r.removed === 1, JSON.stringify(r));

  // 6-3) 신청자 있는 A 를 「신규 신청 중단」 → 저장 허용, 종류는 유지
  resetBoothTypeCache();
  db = saveDb({ existing: EXISTING, counts: COUNTS });
  r = await saveBoothTypes(db, 5, [
    { boothTypeId: 21, name: 'A', price: 1000, sortOrder: 0, isActive: 0 },
    { boothTypeId: 22, name: 'B', price: 2000, sortOrder: 1, isActive: 1 },
  ]);
  check('신규 신청 중단 → 저장 허용', r.ok === true);
  check('중단해도 삭제하지 않음', r.removed === 0);
  check('중단 목록 보고', Array.isArray(r.stopped) && r.stopped.length === 1);

  // 6-4) 신청자 있는 종류의 이름은 안 바뀜
  resetBoothTypeCache();
  db = saveDb({ existing: EXISTING, counts: COUNTS });
  await saveBoothTypes(db, 5, [
    { boothTypeId: 22, name: 'A', price: 1000, sortOrder: 0, isActive: 1 },
    { boothTypeId: 21, name: 'B', price: 2000, sortOrder: 1, isActive: 1 },
  ]);
  const updateA = db.executed.find((e) => e.params && e.params.includes(21));
  check('신청자 있는 종류 이름 고정(A 유지)', !!updateA && updateA.params[0] === 'A', JSON.stringify(updateA?.params));

  // 6-5) isActive 정규화
  const norm = normalizeBoothTypes([{ price: 1000, isActive: false }, { price: 2000 }]);
  check('isActive:false → 0 으로 정규화', norm.ok && norm.list[0].isActive === 0);
  check('isActive 미지정 → 1(모집중)', norm.ok && norm.list[1].isActive === 1);

  resetBoothTypeCache();
})();

/* ------------------------------------------------------------------ */
console.log('\n[7] 승인 시 금액 고정');
/* ------------------------------------------------------------------ */

// 승인·조회용 가짜 DB
function lockDb({ lockColumn = true, ready = true, price = 45000 } = {}) {
  const executed = [];
  return {
    executed,
    async query(sql, params) {
      if (sql.includes('information_schema.tables')) return [[{ cnt: ready ? 1 : 0 }]];
      if (sql.includes('information_schema.columns')) {
        const cols = [];
        if (ready) cols.push({ c: 'boothTypeId' });
        if (lockColumn) cols.push({ c: 'approvedPrice' });
        return [cols];
      }
      if (sql.includes('AS price')) return [[{ price }]];
      executed.push({ sql: sql.trim().split('\n')[0], params });
      return [[]];
    },
  };
}

await (async () => {
  // 7-1) 컬럼이 있으면 승인 시점 금액을 저장
  resetBoothTypeCache();
  let db = lockDb({ price: 45000 });
  let r = await lockApprovedPrice(db, 12);
  check('승인 시 금액 고정됨', r.locked === true && r.price === 45000, JSON.stringify(r));
  check('approvedPrice UPDATE 실행', db.executed.some((e) => e.sql.includes('SET approvedPrice')));
  check('UPDATE 파라미터가 [금액, 신청ID]', JSON.stringify(
    db.executed.find((e) => e.sql.includes('SET approvedPrice'))?.params) === '[45000,12]');

  // 7-2) 컬럼이 없으면 조용히 건너뜀 (승인 자체는 계속 되어야 함)
  resetBoothTypeCache();
  db = lockDb({ lockColumn: false });
  r = await lockApprovedPrice(db, 12);
  check('컬럼 없으면 고정 안 함', r.locked === false);
  check('컬럼 없으면 UPDATE 안 함', !db.executed.some((e) => e.sql.includes('SET approvedPrice')));

  // 7-3) 조회 SQL 이 approvedPrice 를 최우선으로
  resetBoothTypeCache();
  let frag = await boothTypePriceSql(lockDb({}));
  check('가격 우선순위: 확정가 → 종류가 → 마켓가',
    frag.priceExpr === 'COALESCE(a.approvedPrice, bt.price, m.boothPrice)', frag.priceExpr);
  check('lockReady 플래그 노출', frag.lockReady === true);

  // 7-4) 부스 종류 미적용 + 고정 컬럼만 있는 DB
  resetBoothTypeCache();
  frag = await boothTypePriceSql(lockDb({ ready: false, lockColumn: true }));
  check('종류 없어도 확정가는 우선 적용',
    frag.priceExpr === 'COALESCE(a.approvedPrice, m.boothPrice)', frag.priceExpr);

  // 7-5) 둘 다 없는 예전 DB → 완전히 기존 동작
  resetBoothTypeCache();
  frag = await boothTypePriceSql(lockDb({ ready: false, lockColumn: false }));
  check('예전 DB 는 기존 동작 그대로', frag.priceExpr === 'm.boothPrice');

  resetBoothTypeCache();
})();

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
if (fail > 0) {
  console.log('\n실패 항목이 있으면 패치가 일부 폴더만 덮어써졌을 가능성이 큽니다.');
  console.log('zip 안의 backend/ 와 frontend/ 를 각각 다시 덮어써 주세요.');
}
process.exit(fail > 0 ? 1 : 0);
