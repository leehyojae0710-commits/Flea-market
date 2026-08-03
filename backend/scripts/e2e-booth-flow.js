// backend/scripts/e2e-booth-flow.js
// [통합 시나리오 테스트] 실제 DB에 실제 SQL을 실행해서 전 구간을 확인합니다.
//
// 지금까지의 verify-*.js 는 가짜 DB(함수 스텁)로 로직만 봤습니다.
// 이 스크립트는 진짜 MySQL 에 붙어 컨트롤러를 그대로 호출하므로,
// SQL 문법 오류·컬럼명 오타·조인 실수처럼 가짜 DB가 못 잡는 문제를 잡습니다.
//
// ⚠ 테스트 데이터를 만들었다가 끝에 전부 지웁니다.
//    반드시 "버려도 되는 DB" 에서만 실행하세요. (.env 의 DB_NAME 확인)
//
// 실행: cd backend && node scripts/e2e-booth-flow.js

import pool from '../config/db.js';

// 테스트 대상 (실제 서비스 코드)
import { createMarket, updateMarketStatus, getMarketDetail, getApplicationsByMarket } from '../controllers/marketController.js';
import { applyForBooth, approveSellerApplication, getMyApplications } from '../controllers/applicationController.js';
import { deleteMarket, getCancelPreview } from '../controllers/dbdeleteController.js';
import { refundOneApplication, REFUND_MODE } from '../utills/refundCore.js';
import { resetBoothTypeCache } from '../utills/boothTypes.js';
import { resetCancellationCache } from '../utills/marketCancellation.js';
import { resetRefundSchemaCache } from '../utills/refundCore.js';

let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); }
  else {
    fail += 1;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/** 컨트롤러를 부르기 위한 가짜 req/res. 실제 SQL 은 그대로 실행됩니다. */
function fakeRes() {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
async function call(fn, { user, params = {}, body = {}, query = {} } = {}) {
  const res = fakeRes();
  await fn({ user, params, body, query }, res);
  return res;
}

// 캐시를 매번 비웁니다. (스키마 확인 결과가 굳어 있으면 테스트가 헷갈립니다)
function resetCaches() {
  resetBoothTypeCache();
  resetCancellationCache();
  resetRefundSchemaCache();
}

const created = { users: [], markets: [] };

function today(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function makeUser(email, type) {
  const [r] = await pool.query(
    `INSERT INTO users (email, password, name, nickname, userType) VALUES (?, 'x', ?, ?, ?)`,
    [email, email.split('@')[0], email.split('@')[0], type]
  );
  created.users.push(r.insertId);
  return Number(r.insertId);
}

async function run() {
  const [[db]] = await pool.query('SELECT DATABASE() AS d');
  console.log(`\n▶ 대상 DB: ${db.d}`);
  console.log('  테스트 데이터를 만들었다가 끝에 삭제합니다.\n');

  resetCaches();

  const hostId = await makeUser(`e2e_host_${Date.now()}@t.com`, 1);
  const sellerA = await makeUser(`e2e_s1_${Date.now()}@t.com`, 0);
  const sellerB = await makeUser(`e2e_s2_${Date.now()}@t.com`, 0);

  /* ============================================================ */
  console.log('[1] 마켓 등록 — 부스 종류 A/B + 옵션');
  /* ============================================================ */

  let res = await call(createMarket, {
    user: { userId: hostId },
    body: {
      title: 'E2E 테스트 마켓', description: '설명',
      locationName: '부천', region: '경기',
      eventDate_min: today(20), eventDate_max: today(21),
      recruitmentDate_min: today(-5), recruitmentDate_max: today(10),
      boothPrice: 30000, maxparticipants: 5,
      allowOvercapacity: true, allowDuplicateApplication: false,
      boothTypes: [{ price: 30000 }, { price: 45000 }],
    },
  });
  check('마켓 등록 201', res.statusCode === 201, `${res.statusCode} ${res.body?.message}`);
  const marketId = res.body?.data?.marketId;
  if (!marketId) { console.log('\n마켓 생성 실패로 중단합니다.'); return; }
  created.markets.push(marketId);

  check('옵션 저장됨(초과=1, 중복=0)',
    res.body.data.options?.allowOvercapacity === 1 && res.body.data.options?.allowDuplicateApplication === 0,
    JSON.stringify(res.body.data.options));
  check('저장 못한 옵션 없음', (res.body.data.optionsSkipped || []).length === 0);
  check('부스 종류 2건 저장', res.body.data.boothTypeCount === 2, String(res.body.data.boothTypeCount));

  const [dbTypes] = await pool.query(
    'SELECT name, price, sortOrder, isActive FROM market_booth_types WHERE marketId = ? ORDER BY sortOrder', [marketId]);
  check('DB에 A/B 로 저장', dbTypes.map((t) => t.name).join('') === 'AB', JSON.stringify(dbTypes.map((t) => t.name)));
  check('가격 30000 / 45000', dbTypes.map((t) => t.price).join(',') === '30000,45000');

  /* ============================================================ */
  console.log('\n[2] 마켓 상세 — 화면이 받는 데이터');
  /* ============================================================ */

  resetCaches();
  res = await call(getMarketDetail, { params: { marketId } });
  check('상세 조회 200', res.statusCode === 200, String(res.statusCode));
  const detail = res.body?.data;
  check('boothTypes 내려옴', Array.isArray(detail?.boothTypes) && detail.boothTypes.length === 2);
  check('신청 건수 0으로 시작', detail.boothTypes.every((t) => t.applicationCount === 0));
  const typeA = detail.boothTypes[0], typeB = detail.boothTypes[1];

  /* ============================================================ */
  console.log('\n[3] 판매자 신청 — 부스 종류 검증');
  /* ============================================================ */

  resetCaches();
  res = await call(applyForBooth, {
    user: { userId: sellerA },
    body: { marketId, boothNumber: 'A-1', itemName: '수제잼', boothTypeId: null },
  });
  check('종류 미선택 → 거부', res.statusCode === 400 && res.body?.code === 'BOOTH_TYPE_REQUIRED',
    `${res.statusCode} ${res.body?.code}`);

  res = await call(applyForBooth, {
    user: { userId: sellerA },
    body: { marketId, boothNumber: 'A-1', itemName: '수제잼', boothTypeId: 999999 },
  });
  check('없는 종류 → 거부', res.statusCode === 409 && res.body?.code === 'BOOTH_TYPE_NOT_FOUND',
    `${res.statusCode} ${res.body?.code}`);

  res = await call(applyForBooth, {
    user: { userId: sellerA },
    body: { marketId, boothNumber: 'A-1', itemName: '수제잼', boothTypeId: typeB.boothTypeId },
  });
  check('B 부스 신청 성공', res.statusCode === 201, `${res.statusCode} ${res.body?.message}`);
  const appA = res.body?.data?.applicationId;

  const [[savedApp]] = await pool.query('SELECT boothTypeId, status FROM applications WHERE applicationId = ?', [appA]);
  check('boothTypeId 저장됨', Number(savedApp?.boothTypeId) === typeB.boothTypeId);

  resetCaches();
  res = await call(applyForBooth, {
    user: { userId: sellerB },
    body: { marketId, boothNumber: 'A-2', itemName: '비누', boothTypeId: typeA.boothTypeId },
  });
  check('다른 판매자 A 부스 신청 성공', res.statusCode === 201, `${res.statusCode} ${res.body?.message}`);
  const appB = res.body?.data?.applicationId;

  /* ============================================================ */
  console.log('\n[4] 승인 — 금액 확정');
  /* ============================================================ */

  resetCaches();
  res = await call(approveSellerApplication, { user: { userId: hostId }, params: { applicationId: appA } });
  check('승인 200', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);
  check('확정 금액 45,000 반환', res.body?.data?.approvedPrice === 45000, String(res.body?.data?.approvedPrice));

  const [[locked]] = await pool.query('SELECT approvedPrice FROM applications WHERE applicationId = ?', [appA]);
  check('DB에 45,000 고정', Number(locked?.approvedPrice) === 45000, String(locked?.approvedPrice));

  const [[notif]] = await pool.query(
    "SELECT message FROM notifications WHERE applicationId = ? AND type = 'application_approved'", [appA]);
  check('승인 알림에 확정 금액', !!notif && notif.message.includes('45,000'), notif?.message?.slice(0, 60));

  /* ============================================================ */
  console.log('\n[5] 승인 후 가격 인상 — 소급 안 되는지');
  /* ============================================================ */

  resetCaches();
  res = await call(updateMarketStatus, {
    user: { userId: hostId }, params: { marketId },
    body: { boothTypes: [{ boothTypeId: typeA.boothTypeId, price: 30000 }, { boothTypeId: typeB.boothTypeId, price: 60000 }] },
  });
  check('B 가격 60,000 으로 수정 200', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);

  resetCaches();
  res = await call(getMyApplications, { user: { userId: sellerA } });
  const mine = (res.body?.data || []).find((a) => Number(a.applicationId) === Number(appA));
  check('승인자 결제 금액은 45,000 유지', Number(mine?.boothPrice) === 45000, String(mine?.boothPrice));
  check('부스 종류명 B 표시', mine?.boothTypeName === 'B', String(mine?.boothTypeName));

  resetCaches();
  res = await call(getMarketDetail, { params: { marketId } });
  const newB = res.body.data.boothTypes.find((t) => t.boothTypeId === typeB.boothTypeId);
  check('새 신청자용 가격은 60,000', newB?.price === 60000, String(newB?.price));

  /* ============================================================ */
  console.log('\n[6] 신청자 있는 부스 삭제 차단');
  /* ============================================================ */

  resetCaches();
  res = await call(updateMarketStatus, {
    user: { userId: hostId }, params: { marketId },
    body: { boothTypes: [{ boothTypeId: typeA.boothTypeId, price: 30000 }] },
  });
  check('B 삭제 시도 → 409 거부', res.statusCode === 409 && res.body?.code === 'BOOTH_TYPE_IN_USE',
    `${res.statusCode} ${res.body?.code}`);

  const [stillThere] = await pool.query('SELECT COUNT(*) AS c FROM market_booth_types WHERE marketId = ?', [marketId]);
  check('거부 시 B가 지워지지 않음', Number(stillThere[0].c) === 2, String(stillThere[0].c));

  resetCaches();
  res = await call(updateMarketStatus, {
    user: { userId: hostId }, params: { marketId },
    body: {
      boothTypes: [
        { boothTypeId: typeA.boothTypeId, price: 30000 },
        { boothTypeId: typeB.boothTypeId, price: 60000, isActive: false },
      ],
    },
  });
  check('신규 신청 중단은 허용 200', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);
  const [[stopped]] = await pool.query('SELECT isActive FROM market_booth_types WHERE boothTypeId = ?', [typeB.boothTypeId]);
  check('B가 isActive=0 으로', Number(stopped.isActive) === 0);

  // 다시 열어두기 (뒤 시나리오를 위해)
  resetCaches();
  await call(updateMarketStatus, {
    user: { userId: hostId }, params: { marketId },
    body: {
      boothTypes: [
        { boothTypeId: typeA.boothTypeId, price: 30000 },
        { boothTypeId: typeB.boothTypeId, price: 60000, isActive: true },
      ],
    },
  });

  /* ============================================================ */
  console.log('\n[7] 결제 완료 상태 만들기 + 신청자 목록');
  /* ============================================================ */

  await pool.query("UPDATE applications SET status = 'Paid' WHERE applicationId = ?", [appA]);
  await pool.query("INSERT INTO payments (applicationId, amount, status, paymentKey) VALUES (?, ?, 'Paid', NULL)", [appA, 45000]);

  await call(approveSellerApplication, { user: { userId: hostId }, params: { applicationId: appB } });
  await pool.query("UPDATE applications SET status = 'Paid' WHERE applicationId = ?", [appB]);
  await pool.query("INSERT INTO payments (applicationId, amount, status, paymentKey) VALUES (?, ?, 'Paid', NULL)", [appB, 30000]);

  resetCaches();
  res = await call(getApplicationsByMarket, { user: { userId: hostId }, params: { marketId }, query: {} });
  check('신청자 목록 200', res.statusCode === 200, String(res.statusCode));
  const list = res.body?.data?.applications || res.body?.data || [];
  const rowA = (Array.isArray(list) ? list : []).find((a) => Number(a.applicationId) === Number(appA));
  check('목록에 부스 종류명', rowA?.boothTypeName === 'B', String(rowA?.boothTypeName));
  check('목록 금액도 확정가 45,000', Number(rowA?.boothPrice) === 45000, String(rowA?.boothPrice));

  /* ============================================================ */
  console.log('\n[8] 마켓 취소 미리보기');
  /* ============================================================ */

  resetCaches();
  res = await call(getCancelPreview, { user: { userId: hostId }, params: { marketId } });
  check('미리보기 200', res.statusCode === 200, String(res.statusCode));
  const pv = res.body?.data;
  check('환불 2건', pv?.refundCount === 2, String(pv?.refundCount));
  check('환불 총액 75,000', pv?.refundTotal === 75000, String(pv?.refundTotal));
  check('종류별 집계 2그룹', pv?.byBoothType?.length === 2, JSON.stringify(pv?.byBoothType));
  const gB = pv.byBoothType.find((g) => g.boothTypeName === 'B');
  check('B그룹 45,000', gB?.refundTotal === 45000, String(gB?.refundTotal));

  const [beforeCancel] = await pool.query('SELECT isExpired FROM markets WHERE marketId = ?', [marketId]);
  check('미리보기는 DB를 안 바꿈', Number(beforeCancel[0].isExpired) === 0);

  /* ============================================================ */
  console.log('\n[9] 확인 없는 취소 거부');
  /* ============================================================ */

  resetCaches();
  res = await call(deleteMarket, { user: { userId: hostId }, params: { marketId }, body: {} });
  check('confirmRefund 없으면 409', res.statusCode === 409 && res.body?.code === 'CANCEL_CONFIRM_REQUIRED',
    `${res.statusCode} ${res.body?.code}`);
  const [notCancelled] = await pool.query('SELECT isExpired FROM markets WHERE marketId = ?', [marketId]);
  check('거부 시 마켓 그대로', Number(notCancelled[0].isExpired) === 0);
  const [notRefunded] = await pool.query("SELECT COUNT(*) AS c FROM payments p JOIN applications a ON a.applicationId=p.applicationId WHERE a.marketId=? AND p.status='Refunded'", [marketId]);
  check('거부 시 환불도 안 함', Number(notRefunded[0].c) === 0);

  /* ============================================================ */
  console.log('\n[10] 확인 후 취소 — 전액 환불 + 알림');
  /* ============================================================ */

  resetCaches();
  res = await call(deleteMarket, {
    user: { userId: hostId }, params: { marketId }, body: { confirmRefund: true },
  });
  check('취소 200', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);
  check('환불 2건 보고', res.body?.data?.refundedCount === 2, String(res.body?.data?.refundedCount));
  check('환불 총액 75,000 보고', res.body?.data?.refundedTotal === 75000, String(res.body?.data?.refundedTotal));
  check('실패 0건', (res.body?.data?.failed || []).length === 0, JSON.stringify(res.body?.data?.failed));

  const [cancelled] = await pool.query('SELECT isExpired FROM markets WHERE marketId = ?', [marketId]);
  check('마켓 isExpired=2', Number(cancelled[0].isExpired) === 2);

  const [payStatus] = await pool.query(
    "SELECT p.status, p.refundAmount FROM payments p JOIN applications a ON a.applicationId=p.applicationId WHERE a.marketId=?", [marketId]);
  check('결제 2건 모두 Refunded', payStatus.every((p) => p.status === 'Refunded'), JSON.stringify(payStatus.map((p) => p.status)));
  check('환불 금액 기록', payStatus.map((p) => Number(p.refundAmount)).sort((a, b) => a - b).join(',') === '30000,45000',
    JSON.stringify(payStatus.map((p) => p.refundAmount)));

  const [appStatus] = await pool.query('SELECT status FROM applications WHERE marketId = ?', [marketId]);
  check('신청 2건 모두 Refunded', appStatus.every((a) => a.status === 'Refunded'), JSON.stringify(appStatus.map((a) => a.status)));

  const [cancelNotifs] = await pool.query(
    "SELECT userId, message FROM notifications WHERE marketId = ? AND type = 'market_cancelled'", [marketId]);
  check('취소 알림 2건 발송', cancelNotifs.length === 2, String(cancelNotifs.length));
  check('알림에 환불 금액 포함', cancelNotifs.every((n) => /환불/.test(n.message)));

  /* ============================================================ */
  console.log('\n[11] 이중 환불 방지');
  /* ============================================================ */

  resetCaches();
  const dbl = await refundOneApplication(pool, { applicationId: appA, reason: '중복', mode: REFUND_MODE.FULL });
  check('이미 환불된 건 재환불 거부', dbl.ok === false && dbl.code === 'ALREADY_REFUNDED', JSON.stringify(dbl));

  /* ============================================================ */
  console.log('\n[12] 부스 종류 없는 마켓 — 기존 방식 회귀');
  /* ============================================================ */

  resetCaches();
  res = await call(createMarket, {
    user: { userId: hostId },
    body: {
      title: 'E2E 단일가 마켓', locationName: '부천',
      eventDate_min: today(20), eventDate_max: today(21),
      recruitmentDate_min: today(-5), recruitmentDate_max: today(10),
      boothPrice: 12000, maxparticipants: 5,
      boothTypes: [],
    },
  });
  check('종류 없이도 등록 201', res.statusCode === 201, `${res.statusCode} ${res.body?.message}`);
  const plainMarket = res.body?.data?.marketId;
  created.markets.push(plainMarket);

  resetCaches();
  res = await call(applyForBooth, {
    user: { userId: sellerA },
    body: { marketId: plainMarket, boothNumber: 'B-1', itemName: '단일가' },
  });
  check('종류 없이 신청 201', res.statusCode === 201, `${res.statusCode} ${res.body?.message}`);
  const plainApp = res.body?.data?.applicationId;

  resetCaches();
  res = await call(approveSellerApplication, { user: { userId: hostId }, params: { applicationId: plainApp } });
  check('승인 시 마켓 기본가 12,000 확정', res.body?.data?.approvedPrice === 12000, String(res.body?.data?.approvedPrice));

  resetCaches();
  res = await call(getMyApplications, { user: { userId: sellerA } });
  const plainMine = (res.body?.data || []).find((a) => Number(a.applicationId) === Number(plainApp));
  check('금액 12,000, 종류명 없음', Number(plainMine?.boothPrice) === 12000 && !plainMine?.boothTypeName,
    `${plainMine?.boothPrice} / ${plainMine?.boothTypeName}`);

  /* ============================================================ */
  console.log('\n[13] 신청자 없는 마켓 취소');
  /* ============================================================ */

  resetCaches();
  res = await call(createMarket, {
    user: { userId: hostId },
    body: {
      title: 'E2E 빈 마켓', locationName: '부천',
      eventDate_min: today(20), eventDate_max: today(21),
      recruitmentDate_min: today(-5), recruitmentDate_max: today(10),
      boothPrice: 0, maxparticipants: 3,
    },
  });
  const emptyMarket = res.body?.data?.marketId;
  created.markets.push(emptyMarket);

  resetCaches();
  res = await call(getCancelPreview, { user: { userId: hostId }, params: { marketId: emptyMarket } });
  check('빈 마켓 미리보기 환불 0', res.body?.data?.refundCount === 0);

  resetCaches();
  res = await call(deleteMarket, { user: { userId: hostId }, params: { marketId: emptyMarket }, body: {} });
  check('신청자 없으면 확인 없이도 취소됨', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);

  /* ============================================================ */
  console.log('\n[14] 권한');
  /* ============================================================ */

  resetCaches();
  res = await call(getCancelPreview, { user: { userId: sellerA }, params: { marketId: plainMarket } });
  check('남의 마켓 미리보기 403', res.statusCode === 403, String(res.statusCode));

  resetCaches();
  res = await call(deleteMarket, { user: { userId: sellerB }, params: { marketId: plainMarket }, body: { confirmRefund: true } });
  check('남의 마켓 취소 403', res.statusCode === 403, String(res.statusCode));
}

async function cleanup() {
  console.log('\n▶ 테스트 데이터 정리');
  try {
    for (const m of created.markets) {
      await pool.query('DELETE FROM notifications WHERE marketId = ?', [m]);
      await pool.query('DELETE p FROM payments p JOIN applications a ON a.applicationId = p.applicationId WHERE a.marketId = ?', [m]);
      await pool.query('DELETE FROM applications WHERE marketId = ?', [m]);
      await pool.query('DELETE FROM market_booth_types WHERE marketId = ?', [m]);
      await pool.query('DELETE FROM markets WHERE marketId = ?', [m]);
    }
    for (const u of created.users) {
      await pool.query('DELETE FROM notifications WHERE userId = ?', [u]);
      await pool.query('DELETE FROM users WHERE userId = ?', [u]);
    }
    console.log(`  마켓 ${created.markets.length}건 / 사용자 ${created.users.length}건 삭제 완료`);
  } catch (e) {
    console.log('  정리 중 오류(무시 가능):', e.message);
  }
}

try {
  await run();
} catch (error) {
  fail += 1;
  failures.push(`실행 중 예외: ${error.message}`);
  console.error('\n❌ 실행 중 예외:', error);
} finally {
  await cleanup();
}

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
if (failures.length > 0) {
  console.log('\n실패 목록:');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(fail > 0 ? 1 : 0);
