// backend/scripts/verify-booth-capacity.js
// [점검 스크립트] 부스 종류별 수량(정원) 제한과 신청 현황 게이지를 확인합니다.
//
// 왜 필요한가
//   총 정원(markets.maxParticipants)만 있으면 A만 다 차고 C는 비어 있어도
//   막을 방법이 없습니다. 자리 크기·위치가 다르면 종류마다 실제 칸 수가 정해져 있으므로
//   종류별로 따로 제한해야 합니다.
//
// ⚠ 테스트 데이터를 만들었다 지웁니다. 운영 DB 에서는 돌리지 마세요.
// 실행: cd backend && node scripts/verify-booth-capacity.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import {
  normalizeBoothTypes, resolveBoothTypeForApply, getBoothTypes,
  saveBoothTypes, resetBoothTypeCache,
} from '../utills/boothTypes.js';

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
  ['backend/scripts/migrate-add-booth-types.js', 'ADD COLUMN capacity', '수량 컬럼 마이그레이션'],
  ['backend/utills/boothTypes.js', 'BOOTH_TYPE_FULL', '종류별 마감 차단'],
  ['backend/utills/boothTypes.js', 'capacityColumn', '컬럼 유무 판정'],
  ['backend/controllers/applicationController.js', 'allowOvercapacity: overcapacityOn', '초과 허용과 연동'],
  ['frontend/common/js/booth-types.js', 'booth-type-capacity', '수량 입력칸'],
  ['frontend/common/js/booth-types.js', 'function renderGauge', '게이지 렌더'],
  ['frontend/common/js/booth-types.js', '칸 남음', '신청 화면 잔여 표시'],
  ['frontend/pages/B_host-seller/js/market.js', 'firstOpen', '마감 종류 자동선택 방지'],
  ['frontend/common/css/style.css', '.bt-gauge-fill', '게이지 스타일'],
  ['frontend/common/css/style.css', '.booth-type-cap-wrap', '수량 입력 스타일'],
];
for (const [file, marker, label] of MARKERS) {
  const body = read(file);
  if (body === null) { check(`${label} (${file})`, false, '파일 없음'); continue; }
  check(`${label} — ${path.basename(file)}`, body.includes(marker), `'${marker}' 없음`);
}

/* ------------------------------------------------------------------ */
console.log('\n[2] 입력값 정규화');

let r = normalizeBoothTypes([{ price: 30000, capacity: 10 }, { price: 50000 }]);
check('수량 저장됨', r.ok && r.list[0].capacity === 10, JSON.stringify(r.list?.[0]));
check('수량 미입력은 0(제한 없음)', r.ok && r.list[1].capacity === 0, String(r.list?.[1]?.capacity));

r = normalizeBoothTypes([{ price: 1000, capacity: '' }]);
check('빈 문자열도 0', r.ok && r.list[0].capacity === 0);

r = normalizeBoothTypes([{ price: 1000, capacity: -1 }]);
check('음수 수량 거부', r.ok === false, r.message);

r = normalizeBoothTypes([{ price: 1000, capacity: 1.5 }]);
check('소수 수량 거부', r.ok === false, r.message);

r = normalizeBoothTypes([{ price: 1000, capacity: 999999 }]);
check('비정상적으로 큰 수량 거부', r.ok === false, r.message);

/* ------------------------------------------------------------------ */
console.log('\n[3] 실제 DB — 종류별 마감');

const created = { users: [], markets: [] };
function day(o) { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); }

async function run() {
  const [[db]] = await pool.query('SELECT DATABASE() AS d');
  console.log(`  대상 DB: ${db.d}\n`);
  resetBoothTypeCache();

  const [h] = await pool.query(
    `INSERT INTO users (email, password, name, nickname, userType) VALUES (?, 'x', 'h', 'h', 1)`,
    [`cap_host_${Date.now()}@t.com`]);
  const hostId = Number(h.insertId); created.users.push(hostId);
  const [u] = await pool.query(
    `INSERT INTO users (email, password, name, nickname, userType) VALUES (?, 'x', 's', 's', 0)`,
    [`cap_s_${Date.now()}@t.com`]);
  const sellerId = Number(u.insertId); created.users.push(sellerId);

  // 총 정원 10, A는 2칸만, B는 제한 없음
  const [m] = await pool.query(
    `INSERT INTO markets (hostId, title, description, locationName, boothPrice, maxParticipants,
       eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max)
     VALUES (?, 'CAP 테스트', '', '부천', 30000, 10, ?, ?, ?, ?)`,
    [hostId, day(20), day(21), day(-5), day(10)]);
  const marketId = Number(m.insertId); created.markets.push(marketId);

  const saved = await saveBoothTypes(pool, marketId, [
    { boothTypeId: null, name: 'A', price: 30000, sortOrder: 0, capacity: 2, isActive: 1 },
    { boothTypeId: null, name: 'B', price: 50000, sortOrder: 1, capacity: 0, isActive: 1 },
  ]);
  check('종류 저장 성공', saved.ok === true, JSON.stringify(saved));

  resetBoothTypeCache();
  const types = await getBoothTypes(pool, marketId);
  const A = types.find((t) => t.name === 'A');
  const B = types.find((t) => t.name === 'B');
  check('A 수량 2로 저장', A?.capacity === 2, String(A?.capacity));
  check('B 수량 0(제한 없음)', B?.capacity === 0, String(B?.capacity));
  check('신청 0건에서 시작', A?.applicationCount === 0);

  // A에 2건 채우기
  for (let i = 0; i < 2; i += 1) {
    await pool.query(
      `INSERT INTO applications (marketId, sellerId, boothNumber, itemName, status, boothTypeId)
       VALUES (?, ?, ?, '물건', 'Pending', ?)`, [marketId, sellerId, `A-${i}`, A.boothTypeId]);
  }

  resetBoothTypeCache();
  let res = await resolveBoothTypeForApply(pool, { marketId, boothTypeId: A.boothTypeId });
  check('A 정원 찼으면 거부', res.ok === false && res.code === 'BOOTH_TYPE_FULL', JSON.stringify(res));
  check('거부 안내에 2/2 표시', res.ok === false && /2\/2/.test(res.message), res.message);

  resetBoothTypeCache();
  res = await resolveBoothTypeForApply(pool, { marketId, boothTypeId: B.boothTypeId });
  check('B는 제한 없어 통과', res.ok === true, JSON.stringify(res));

  // 총 정원(10)에는 아직 여유가 있는데도 A만 막히는지 — 이게 이 기능의 핵심입니다
  const [[occ]] = await pool.query(
    `SELECT COUNT(*) AS c FROM applications WHERE marketId = ? AND status IN ('Pending','Approved','Paid')`,
    [marketId]);
  check('총 정원에는 여유 있음 (2/10)', Number(occ.c) === 2 && Number(occ.c) < 10, String(occ.c));

  // 초과 허용을 켜면 종류별 정원도 풀려야 함
  resetBoothTypeCache();
  res = await resolveBoothTypeForApply(pool, { marketId, boothTypeId: A.boothTypeId, allowOvercapacity: true });
  check('초과 허용 ON → A도 통과', res.ok === true, JSON.stringify(res));

  // 반려 건은 자리를 안 차지해야 함
  await pool.query(
    `UPDATE applications SET status = 'Rejected' WHERE marketId = ? AND boothTypeId = ? LIMIT 1`,
    [marketId, A.boothTypeId]);
  resetBoothTypeCache();
  res = await resolveBoothTypeForApply(pool, { marketId, boothTypeId: A.boothTypeId });
  check('반려 건은 자리에서 빠짐 → 다시 신청 가능', res.ok === true, JSON.stringify(res));

  // 게이지 분자로 쓰이는 applicationCount 확인
  resetBoothTypeCache();
  const types2 = await getBoothTypes(pool, marketId);
  const A2 = types2.find((t) => t.name === 'A');
  check('게이지 분자(신청 수) 1로 갱신', A2?.applicationCount === 1, String(A2?.applicationCount));
  check('게이지 분모(수량) 2 유지', A2?.capacity === 2, String(A2?.capacity));

  resetBoothTypeCache();
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
