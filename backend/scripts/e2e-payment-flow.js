// backend/scripts/e2e-payment-flow.js
// [결제·환불 통합 테스트] PortOne 호출만 가짜로 바꾸고, 나머지는 전부 실제 코드·실제 DB로 돌립니다.
//
// 왜 필요한가
//   e2e-booth-flow.js 는 payments 행을 직접 넣어 "결제된 척"만 했습니다.
//   그래서 결제 검증(confirmPayment)과 실제 환불 호출(cencelPayment)은 한 번도 안 거쳤습니다.
//   여기서는 axios 어댑터를 갈아끼워 PortOne 응답을 흉내 내고,
//   금액 검증·중복 결제 방지·환불 호출 인자까지 확인합니다.
//
// ⚠ 테스트 데이터를 만들었다가 끝에 전부 지웁니다. 운영 DB에서 실행하지 마세요.
//    출력을 | head 로 자르면 정리 단계가 실행되지 않습니다. 그대로 실행하세요.
//
// 실행: cd backend && node scripts/e2e-payment-flow.js

import axios from 'axios';
import pool from '../config/db.js';

/* ------------------------------------------------------------------ */
/* PortOne 가짜 서버 — axios 어댑터를 갈아끼웁니다                       */
/* ------------------------------------------------------------------ */

const portone = {
  calls: [],                 // 실제로 나간 요청 기록
  paid: new Map(),           // paymentId -> { status, amount }
  failNext: false,           // 다음 호출을 실패시킬지 (장애 상황 재현)
};

axios.defaults.adapter = async (config) => {
  const url = config.url || '';
  const method = (config.method || 'get').toLowerCase();
  const body = config.data ? JSON.parse(config.data) : null;

  portone.calls.push({ url, method, body });

  if (portone.failNext) {
    portone.failNext = false;
    const err = new Error('PortOne 장애');
    err.response = { data: { message: '결제사 오류' } };
    throw err;
  }

  // GET /payments/{id}  — 결제 조회
  const getMatch = url.match(/\/payments\/([^/]+)$/);
  if (method === 'get' && getMatch) {
    const id = decodeURIComponent(getMatch[1]);
    const rec = portone.paid.get(id);
    if (!rec) {
      const err = new Error('not found');
      err.response = { data: { message: '결제 없음' } };
      throw err;
    }
    return { data: { status: rec.status, amount: { total: rec.amount } }, status: 200, config, headers: {} };
  }

  // POST /payments/{id}/cancel — 결제 취소
  const cancelMatch = url.match(/\/payments\/([^/]+)\/cancel$/);
  if (method === 'post' && cancelMatch) {
    const id = decodeURIComponent(cancelMatch[1]);
    return {
      data: { cancellation: { id: 'c_' + id, totalAmount: body?.amount ?? portone.paid.get(id)?.amount } },
      status: 200, config, headers: {},
    };
  }

  return { data: {}, status: 200, config, headers: {} };
};

// 어댑터를 갈아끼운 뒤에 불러와야 합니다.
const { confirmPayment, refundPayment } = await import('../controllers/payController.js');
const { createMarket } = await import('../controllers/marketController.js');
const { applyForBooth, approveSellerApplication } = await import('../controllers/applicationController.js');
const { deleteMarket } = await import('../controllers/dbdeleteController.js');
const { resetBoothTypeCache } = await import('../utills/boothTypes.js');
const { resetCancellationCache } = await import('../utills/marketCancellation.js');
const { resetRefundSchemaCache } = await import('../utills/refundCore.js');

/* ------------------------------------------------------------------ */

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

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
function resetCaches() {
  resetBoothTypeCache(); resetCancellationCache(); resetRefundSchemaCache();
}

const created = { users: [], markets: [] };
function today(o) { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); }

async function makeUser(email, userType) {
  const [r] = await pool.query(
    `INSERT INTO users (email, password, name, nickname, userType) VALUES (?, 'x', ?, ?, ?)`,
    [email, 'n', 'n', userType]
  );
  created.users.push(r.insertId);
  return Number(r.insertId);
}

async function run() {
  const [[db]] = await pool.query('SELECT DATABASE() AS d');
  console.log(`\n▶ 대상 DB: ${db.d}  (PortOne 은 가짜 응답으로 대체)\n`);
  resetCaches();

  const hostId = await makeUser(`pay_host_${Date.now()}@t.com`, 1);
  const seller = await makeUser(`pay_s1_${Date.now()}@t.com`, 0);
  const seller2 = await makeUser(`pay_s2_${Date.now()}@t.com`, 0);

  /* ============================================================ */
  console.log('[1] 준비 — 부스 A 30,000 / B 45,000 마켓');
  /* ============================================================ */

  let res = await call(createMarket, {
    user: { userId: hostId },
    body: {
      title: '결제 테스트 마켓', locationName: '부천',
      eventDate_min: today(20), eventDate_max: today(21),
      recruitmentDate_min: today(-5), recruitmentDate_max: today(10),
      boothPrice: 30000, maxparticipants: 5,
      boothTypes: [{ price: 30000 }, { price: 45000 }],
    },
  });
  const marketId = res.body?.data?.marketId;
  created.markets.push(marketId);
  check('마켓 준비', !!marketId, res.body?.message);

  const [types] = await pool.query('SELECT boothTypeId, name, price FROM market_booth_types WHERE marketId = ? ORDER BY sortOrder', [marketId]);
  const typeB = types.find((t) => t.name === 'B');

  resetCaches();
  res = await call(applyForBooth, {
    user: { userId: seller },
    body: { marketId, boothNumber: 'A-1', itemName: '잼', boothTypeId: typeB.boothTypeId },
  });
  const appId = res.body?.data?.applicationId;
  check('B 부스 신청', !!appId, res.body?.message);

  /* ============================================================ */
  console.log('\n[2] 승인 전 결제 차단');
  /* ============================================================ */

  portone.paid.set('pid_early', { status: 'PAID', amount: 45000 });
  resetCaches();
  res = await call(confirmPayment, {
    user: { userId: seller }, body: { applicationId: appId, paymentId: 'pid_early' },
  });
  check('승인 전 결제 → 409', res.statusCode === 409, `${res.statusCode} ${res.body?.message}`);

  /* ============================================================ */
  console.log('\n[3] 승인 → 금액 확정');
  /* ============================================================ */

  resetCaches();
  res = await call(approveSellerApplication, { user: { userId: hostId }, params: { applicationId: appId } });
  check('승인 시 45,000 확정', res.body?.data?.approvedPrice === 45000, String(res.body?.data?.approvedPrice));

  /* ============================================================ */
  console.log('\n[4] 결제 금액 검증');
  /* ============================================================ */

  // 4-1) 금액이 다르면 거부되어야 합니다 (조작된 결제 방어)
  portone.paid.set('pid_wrong', { status: 'PAID', amount: 1000 });
  resetCaches();
  res = await call(confirmPayment, {
    user: { userId: seller }, body: { applicationId: appId, paymentId: 'pid_wrong' },
  });
  check('금액 불일치 → 400 거부', res.statusCode === 400 && /일치하지/.test(res.body?.message || ''),
    `${res.statusCode} ${res.body?.message}`);

  const [noPay] = await pool.query('SELECT COUNT(*) c FROM payments WHERE applicationId = ?', [appId]);
  check('거부 시 결제 기록 안 남음', Number(noPay[0].c) === 0);

  // 4-2) 결제 미완료 상태도 거부
  portone.paid.set('pid_pending', { status: 'READY', amount: 45000 });
  resetCaches();
  res = await call(confirmPayment, {
    user: { userId: seller }, body: { applicationId: appId, paymentId: 'pid_pending' },
  });
  check('미완료 결제 → 400 거부', res.statusCode === 400, `${res.statusCode} ${res.body?.message}`);

  // 4-3) 남의 신청 결제 시도
  portone.paid.set('pid_ok', { status: 'PAID', amount: 45000 });
  resetCaches();
  res = await call(confirmPayment, {
    user: { userId: seller2 }, body: { applicationId: appId, paymentId: 'pid_ok' },
  });
  check('남의 신청 결제 → 403', res.statusCode === 403, String(res.statusCode));

  // 4-4) 정상 결제
  resetCaches();
  res = await call(confirmPayment, {
    user: { userId: seller }, body: { applicationId: appId, paymentId: 'pid_ok' },
  });
  check('정상 결제 성공(201)', [200, 201].includes(res.statusCode), `${res.statusCode} ${res.body?.message}`);

  const [[payRow]] = await pool.query('SELECT amount, status, paymentKey FROM payments WHERE applicationId = ?', [appId]);
  check('결제 금액 45,000 기록', Number(payRow?.amount) === 45000, String(payRow?.amount));
  check('paymentKey 저장됨', payRow?.paymentKey === 'pid_ok', String(payRow?.paymentKey));
  const [[appRow]] = await pool.query('SELECT status FROM applications WHERE applicationId = ?', [appId]);
  check('신청 상태 Paid', appRow?.status === 'Paid', String(appRow?.status));

  // 4-5) 중복 결제 방지
  resetCaches();
  res = await call(confirmPayment, {
    user: { userId: seller }, body: { applicationId: appId, paymentId: 'pid_ok' },
  });
  check('중복 결제 차단', res.statusCode !== 200 || /이미/.test(res.body?.message || ''),
    `${res.statusCode} ${res.body?.message}`);
  const [payCount] = await pool.query('SELECT COUNT(*) c FROM payments WHERE applicationId = ?', [appId]);
  check('결제 행은 1개만', Number(payCount[0].c) === 1, String(payCount[0].c));

  /* ============================================================ */
  console.log('\n[5] 승인 후 가격 인상 — 결제 금액이 흔들리지 않는지');
  /* ============================================================ */

  // 확정가가 없었다면, 주최자가 가격을 올린 순간 결제창 금액과 서버 기대값이 어긋나
  // "결제 금액이 일치하지 않습니다"로 막히면서 돈만 빠져나가는 상황이 됩니다.
  await pool.query('UPDATE market_booth_types SET price = 90000 WHERE boothTypeId = ?', [typeB.boothTypeId]);

  resetCaches();
  res = await call(applyForBooth, {
    user: { userId: seller2 },
    body: { marketId, boothNumber: 'A-2', itemName: '비누', boothTypeId: typeB.boothTypeId },
  });
  const app2 = res.body?.data?.applicationId;
  resetCaches();
  res = await call(approveSellerApplication, { user: { userId: hostId }, params: { applicationId: app2 } });
  check('새 신청자는 인상된 90,000 확정', res.body?.data?.approvedPrice === 90000, String(res.body?.data?.approvedPrice));

  const [[old]] = await pool.query('SELECT approvedPrice FROM applications WHERE applicationId = ?', [appId]);
  check('기존 결제자는 45,000 그대로', Number(old.approvedPrice) === 45000, String(old.approvedPrice));

  portone.paid.set('pid_2', { status: 'PAID', amount: 90000 });
  resetCaches();
  res = await call(confirmPayment, { user: { userId: seller2 }, body: { applicationId: app2, paymentId: 'pid_2' } });
  check('새 신청자 90,000 결제 성공', [200, 201].includes(res.statusCode), `${res.statusCode} ${res.body?.message}`);

  /* ============================================================ */
  console.log('\n[6] 건별 환불 — 결제사 호출 인자 확인');
  /* ============================================================ */

  portone.calls = [];
  resetCaches();
  res = await call(refundPayment, {
    user: { userId: hostId }, body: { applicationId: app2, reason: '주최자 사정' },
  });
  check('환불 200', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);
  check('환불 금액 90,000 반환', res.body?.data?.refundedAmount === 90000, String(res.body?.data?.refundedAmount));

  const cancelCall = portone.calls.find((c) => /\/cancel$/.test(c.url));
  check('PortOne 취소 호출됨', !!cancelCall, JSON.stringify(portone.calls.map((c) => c.url)));
  check('올바른 paymentId 로 호출', cancelCall?.url.includes('pid_2'), cancelCall?.url);
  check('전액 취소라 amount 미지정', cancelCall && cancelCall.body?.amount === undefined, JSON.stringify(cancelCall?.body));
  check('사유 전달됨', cancelCall?.body?.reason === '주최자 사정', JSON.stringify(cancelCall?.body));

  const [[refunded]] = await pool.query('SELECT status, refundAmount FROM payments WHERE applicationId = ?', [app2]);
  check('payments Refunded + 금액 기록', refunded?.status === 'Refunded' && Number(refunded.refundAmount) === 90000,
    JSON.stringify(refunded));

  /* ============================================================ */
  console.log('\n[7] 부분 환불 — 기존 동작 보존');
  /* ============================================================ */

  // 판매자가 부분 환불을 요청해 둔 상태를 만듭니다.
  await pool.query("UPDATE payments SET status='RefundRequested', refundAmount=20000 WHERE applicationId=?", [appId]);
  await pool.query("UPDATE applications SET status='RefundRequested' WHERE applicationId=?", [appId]);

  portone.calls = [];
  resetCaches();
  res = await call(refundPayment, { user: { userId: hostId }, body: { applicationId: appId, reason: '부분 환불' } });
  check('부분 환불 200', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);
  check('요청액 20,000 만 환불', res.body?.data?.refundedAmount === 20000, String(res.body?.data?.refundedAmount));

  const partialCall = portone.calls.find((c) => /\/cancel$/.test(c.url));
  check('부분 취소는 amount 전달', partialCall?.body?.amount === 20000, JSON.stringify(partialCall?.body));

  /* ============================================================ */
  console.log('\n[8] 마켓 취소 — 결제사 호출까지 확인');
  /* ============================================================ */

  resetCaches();
  res = await call(createMarket, {
    user: { userId: hostId },
    body: {
      title: '취소 테스트 마켓', locationName: '부천',
      eventDate_min: today(20), eventDate_max: today(21),
      recruitmentDate_min: today(-5), recruitmentDate_max: today(10),
      boothPrice: 25000, maxparticipants: 5, boothTypes: [{ price: 25000 }],
    },
  });
  const m2 = res.body?.data?.marketId;
  created.markets.push(m2);
  const [t2] = await pool.query('SELECT boothTypeId FROM market_booth_types WHERE marketId = ?', [m2]);

  resetCaches();
  res = await call(applyForBooth, {
    user: { userId: seller }, body: { marketId: m2, boothNumber: 'C-1', itemName: '컵', boothTypeId: t2[0].boothTypeId },
  });
  const app3 = res.body?.data?.applicationId;
  resetCaches();
  await call(approveSellerApplication, { user: { userId: hostId }, params: { applicationId: app3 } });
  portone.paid.set('pid_3', { status: 'PAID', amount: 25000 });
  resetCaches();
  res = await call(confirmPayment, { user: { userId: seller }, body: { applicationId: app3, paymentId: 'pid_3' } });
  check('취소 테스트용 결제 완료', [200, 201].includes(res.statusCode), `${res.statusCode} ${res.body?.message}`);

  portone.calls = [];
  resetCaches();
  res = await call(deleteMarket, { user: { userId: hostId }, params: { marketId: m2 }, body: { confirmRefund: true } });
  check('마켓 취소 200', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);
  check('환불 1건 처리', res.body?.data?.refundedCount === 1, String(res.body?.data?.refundedCount));

  const mcCall = portone.calls.find((c) => /\/cancel$/.test(c.url));
  check('마켓 취소도 PortOne 호출', !!mcCall && mcCall.url.includes('pid_3'), mcCall?.url);
  check('마켓 취소는 전액(amount 미지정)', mcCall && mcCall.body?.amount === undefined, JSON.stringify(mcCall?.body));

  /* ============================================================ */
  console.log('\n[9] 결제사 장애 시 — 장부가 앞서가지 않는지');
  /* ============================================================ */

  resetCaches();
  res = await call(createMarket, {
    user: { userId: hostId },
    body: {
      title: '장애 테스트 마켓', locationName: '부천',
      eventDate_min: today(20), eventDate_max: today(21),
      recruitmentDate_min: today(-5), recruitmentDate_max: today(10),
      boothPrice: 15000, maxparticipants: 5,
    },
  });
  const m3 = res.body?.data?.marketId;
  created.markets.push(m3);

  resetCaches();
  res = await call(applyForBooth, { user: { userId: seller }, body: { marketId: m3, boothNumber: 'D-1', itemName: '초' } });
  const app4 = res.body?.data?.applicationId;
  resetCaches();
  await call(approveSellerApplication, { user: { userId: hostId }, params: { applicationId: app4 } });
  portone.paid.set('pid_4', { status: 'PAID', amount: 15000 });
  resetCaches();
  await call(confirmPayment, { user: { userId: seller }, body: { applicationId: app4, paymentId: 'pid_4' } });

  portone.failNext = true;   // 다음 PortOne 호출을 실패시킴
  resetCaches();
  res = await call(refundPayment, { user: { userId: hostId }, body: { applicationId: app4, reason: '장애 테스트' } });
  check('결제사 실패 시 500 반환', res.statusCode === 500, `${res.statusCode} ${res.body?.message}`);

  const [[stillPaid]] = await pool.query('SELECT status FROM payments WHERE applicationId = ?', [app4]);
  check('돈이 안 빠졌으면 장부도 Paid 유지', stillPaid?.status === 'Paid', String(stillPaid?.status));
  const [[appStill]] = await pool.query('SELECT status FROM applications WHERE applicationId = ?', [app4]);
  check('신청도 Paid 유지', appStill?.status === 'Paid', String(appStill?.status));

  // 재시도하면 정상 처리되어야 합니다.
  resetCaches();
  res = await call(refundPayment, { user: { userId: hostId }, body: { applicationId: app4, reason: '재시도' } });
  check('재시도하면 환불 성공', res.statusCode === 200, `${res.statusCode} ${res.body?.message}`);

  /* ============================================================ */
  console.log('\n[10] 무료 부스 — PortOne 안 거치는지');
  /* ============================================================ */

  resetCaches();
  res = await call(createMarket, {
    user: { userId: hostId },
    body: {
      title: '무료 마켓', locationName: '부천',
      eventDate_min: today(20), eventDate_max: today(21),
      recruitmentDate_min: today(-5), recruitmentDate_max: today(10),
      boothPrice: 0, maxparticipants: 5, boothTypes: [{ price: 0 }],
    },
  });
  const m4 = res.body?.data?.marketId;
  created.markets.push(m4);
  const [t4] = await pool.query('SELECT boothTypeId FROM market_booth_types WHERE marketId = ?', [m4]);

  resetCaches();
  res = await call(applyForBooth, {
    user: { userId: seller2 }, body: { marketId: m4, boothNumber: 'E-1', itemName: '무료', boothTypeId: t4[0].boothTypeId },
  });
  const app5 = res.body?.data?.applicationId;
  resetCaches();
  await call(approveSellerApplication, { user: { userId: hostId }, params: { applicationId: app5 } });

  portone.calls = [];
  resetCaches();
  res = await call(confirmPayment, { user: { userId: seller2 }, body: { applicationId: app5 } });
  check('무료 부스는 paymentId 없이 결제 성공', [200, 201].includes(res.statusCode), `${res.statusCode} ${res.body?.message}`);
  check('무료 부스는 PortOne 호출 안 함', portone.calls.length === 0, JSON.stringify(portone.calls.map((c) => c.url)));
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
