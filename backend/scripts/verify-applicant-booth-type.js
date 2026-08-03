// backend/scripts/verify-applicant-booth-type.js
// [점검 스크립트] 신청자 목록에 부스 종류(A/B/C) 구분·집계·정원 현황이 붙었는지 확인합니다.
//
// 확인 내용
//   1) 파일 마커 — 배지/필터/현황 UI 가 실제로 들어갔는지
//   2) 실제 DB — 종류별 집계와 정원 현황 숫자가 맞는지
//      (반려·환불 건이 "찬 자리"에 안 섞이는지가 핵심입니다.
//       섞이면 주최자가 남은 자리를 잘못 알게 됩니다.)
//
// ⚠ 테스트 데이터를 만들었다 지웁니다. 운영 DB 에서는 돌리지 마세요.
// 실행: cd backend && node scripts/verify-applicant-booth-type.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import { getApplicationsByMarket } from '../controllers/marketController.js';
import { resetBoothTypeCache } from '../utills/boothTypes.js';

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

console.log('\n[1] 파일 마커');

const MARKERS = [
  ['backend/controllers/marketController.js', 'boothTypeSummary', '서버 집계'],
  ['backend/controllers/marketController.js', 'occupiedCount: occupiedTotal', '정원 현황'],
  ['frontend/pages/B_host-seller/js/market.js', 'renderBoothTypeBadge', '카드 종류 배지'],
  ['frontend/pages/B_host-seller/js/market.js', 'renderBoothTypeSummary', '현황 렌더'],
  ['frontend/pages/B_host-seller/js/market.js', 'boothTypeFilter', '종류 필터 상태'],
  ['frontend/pages/B_host-seller/js/market.js', 'handleBoothTypeChipClick', '칩 클릭 필터'],
  ['frontend/pages/B_host-seller/market-detail.html', 'application-booth-type-filter', '필터 드롭다운'],
  ['frontend/pages/B_host-seller/market-detail.html', 'application-booth-type-summary', '현황 영역'],
  // [주의] 캐시 버전 숫자를 못 박으면 기능이 정상인데도 이 검사만 실패해 진짜 문제를 가립니다.
  //        버전 표기가 붙어 있는지만 확인합니다. (팀원 스크립트에서 같은 문제가 있어 고친 적 있음)
  ['frontend/pages/B_host-seller/market-detail.html', 'market.js?v=', '캐시 버전 표기'],
  ['frontend/common/css/style.css', '.booth-type-badge', '배지 스타일'],
  ['frontend/common/css/style.css', '.bts-chip', '현황 칩 스타일'],
];
for (const [file, marker, label] of MARKERS) {
  const body = read(file);
  if (body === null) { check(`${label} (${file})`, false, '파일 없음'); continue; }
  check(`${label} — ${path.basename(file)}`, body.includes(marker), `'${marker}' 없음`);
}

/* ------------------------------------------------------------------ */
console.log('\n[2] 실제 DB 집계');

function fakeRes() {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

const created = { users: [], markets: [] };
function day(o) { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); }

async function run() {
  const [[db]] = await pool.query('SELECT DATABASE() AS d');
  console.log(`  대상 DB: ${db.d} (테스트 데이터는 끝에 삭제)\n`);
  resetBoothTypeCache();

  const [h] = await pool.query(
    `INSERT INTO users (email, password, name, nickname, userType) VALUES (?, 'x', 'h', 'h', 1)`,
    [`bt_host_${Date.now()}@t.com`]);
  const hostId = Number(h.insertId); created.users.push(hostId);

  const sellers = [];
  for (let i = 0; i < 3; i += 1) {
    const [u] = await pool.query(
      `INSERT INTO users (email, password, name, nickname, userType) VALUES (?, 'x', 's', ?, 0)`,
      [`bt_s${i}_${Date.now()}@t.com`, `판매자${i}`]);
    sellers.push(Number(u.insertId)); created.users.push(Number(u.insertId));
  }

  // 정원 5인 마켓 + 부스 A/B
  const [m] = await pool.query(
    `INSERT INTO markets (hostId, title, description, locationName, boothPrice, maxParticipants,
       eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max)
     VALUES (?, 'BT 테스트', '', '부천', 30000, 5, ?, ?, ?, ?)`,
    [hostId, day(20), day(21), day(-5), day(10)]);
  const marketId = Number(m.insertId); created.markets.push(marketId);

  const [ta] = await pool.query(
    `INSERT INTO market_booth_types (marketId, name, price, sortOrder, isActive) VALUES (?, 'A', 30000, 0, 1)`, [marketId]);
  const [tb] = await pool.query(
    `INSERT INTO market_booth_types (marketId, name, price, sortOrder, isActive) VALUES (?, 'B', 50000, 1, 1)`, [marketId]);
  const typeA = Number(ta.insertId), typeB = Number(tb.insertId);

  // A: 대기1 + 승인1 + 결제1 = 점유 3
  // B: 대기1 = 점유 1
  // A: 반려1  → 점유에 안 들어가야 함
  // B: 환불1  → 점유에 안 들어가야 함
  const rows = [
    [typeA, sellers[0], 'A-1', 'Pending'],
    [typeA, sellers[1], 'A-2', 'Approved'],
    [typeA, sellers[2], 'A-3', 'Paid'],
    [typeA, sellers[0], 'A-4', 'Rejected'],
    [typeB, sellers[1], 'B-1', 'Pending'],
    [typeB, sellers[2], 'B-2', 'Refunded'],
  ];
  for (const [t, s, b, st] of rows) {
    await pool.query(
      `INSERT INTO applications (marketId, sellerId, boothNumber, itemName, status, boothTypeId)
       VALUES (?, ?, ?, '물건', ?, ?)`, [marketId, s, b, st, t]);
  }

  resetBoothTypeCache();
  const res = fakeRes();
  await getApplicationsByMarket({ user: { userId: hostId }, params: { marketId }, query: {} }, res);

  check('목록 조회 200', res.statusCode === 200, String(res.statusCode));
  const body = res.body || {};
  const summary = body.boothTypeSummary || [];

  check('종류 2그룹(A/B)', summary.length === 2, JSON.stringify(summary.map((g) => g.boothTypeName)));
  check('A가 먼저 정렬', summary[0]?.boothTypeName === 'A', String(summary[0]?.boothTypeName));

  const A = summary.find((g) => g.boothTypeName === 'A');
  const B = summary.find((g) => g.boothTypeName === 'B');

  check('A 전체 4건', A?.total === 4, String(A?.total));
  check('A 점유 3칸 (반려 제외)', A?.occupied === 3, String(A?.occupied));
  check('A 상태별 대기1/승인1/결제1/반려1',
    A?.pending === 1 && A?.approved === 1 && A?.paid === 1 && A?.rejected === 1, JSON.stringify(A));
  check('A 점유분 금액 90,000', A?.amount === 90000, String(A?.amount));

  check('B 전체 2건', B?.total === 2, String(B?.total));
  check('B 점유 1칸 (환불 제외)', B?.occupied === 1, String(B?.occupied));
  check('B 점유분 금액 50,000', B?.amount === 50000, String(B?.amount));

  check('전체 점유 4칸', body.occupiedCount === 4, String(body.occupiedCount));
  check('정원 5 인식 (maxParticipants 대문자)', body.capacity === 5, String(body.capacity));

  const one = (body.data || []).find((a) => a.boothNumber === 'A-1');
  check('각 신청에 종류명 포함', one?.boothTypeName === 'A', String(one?.boothTypeName));
  check('각 신청에 금액 포함', Number(one?.boothPrice) === 30000, String(one?.boothPrice));

  // 종류를 안 쓰는 마켓 — '기본' 으로 묶여야 함
  const [m2] = await pool.query(
    `INSERT INTO markets (hostId, title, description, locationName, boothPrice, maxParticipants,
       eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max)
     VALUES (?, 'BT 단일가', '', '부천', 12000, 0, ?, ?, ?, ?)`,
    [hostId, day(20), day(21), day(-5), day(10)]);
  const plainId = Number(m2.insertId); created.markets.push(plainId);
  await pool.query(
    `INSERT INTO applications (marketId, sellerId, boothNumber, itemName, status)
     VALUES (?, ?, 'C-1', '물건', 'Pending')`, [plainId, sellers[0]]);

  resetBoothTypeCache();
  const res2 = fakeRes();
  await getApplicationsByMarket({ user: { userId: hostId }, params: { marketId: plainId }, query: {} }, res2);
  const s2 = res2.body?.boothTypeSummary || [];
  check('종류 없는 마켓은 기본 그룹', s2.length === 1 && s2[0].boothTypeName === '기본', JSON.stringify(s2));
  check('정원 0이면 제한 없음으로 전달', res2.body?.capacity === 0, String(res2.body?.capacity));
}

async function cleanup() {
  console.log('\n▶ 테스트 데이터 정리');
  try {
    for (const m of created.markets) {
      await pool.query('DELETE FROM applications WHERE marketId = ?', [m]);
      await pool.query('DELETE FROM market_booth_types WHERE marketId = ?', [m]);
      await pool.query('DELETE FROM markets WHERE marketId = ?', [m]);
    }
    for (const u of created.users) await pool.query('DELETE FROM users WHERE userId = ?', [u]);
    console.log(`  마켓 ${created.markets.length}건 / 사용자 ${created.users.length}건 삭제 완료`);
  } catch (e) { console.log('  정리 중 오류:', e.message); }
}

try { await run(); }
catch (e) { fail += 1; failures.push(`예외: ${e.message}`); console.error('\n❌ 예외:', e); }
finally { await cleanup(); }

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
if (failures.length) { console.log('\n실패 목록:'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
