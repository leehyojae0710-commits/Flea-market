// backend/scripts/verify-refund-core.js
// [점검 스크립트] 환불 절차를 공통 코어로 합친 뒤에도 기존 동작이 그대로인지 확인합니다.
//
// 특히 중요한 것: 지금 잘 돌고 있는 「일괄 결제취소」가 쓰는 경로(POST /pay/refund)의
// 동작이 하나도 안 바뀌어야 합니다.
//   - Paid            → 전액 취소
//   - RefundRequested → refundAmount 만큼 부분 취소
//
// DB 도 서버도 필요 없습니다.
// 실행: cd backend && node scripts/verify-refund-core.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  REFUND_MODE, refundOneApplication, loadRefundTarget,
  getRefundSchema, resetRefundSchemaCache,
} from '../utills/refundCore.js';

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
console.log('\n[1] 세 경로가 같은 코어를 쓰는지');
/* ------------------------------------------------------------------ */

const MARKERS = [
  ['backend/utills/refundCore.js', 'refundOneApplication', '코어 함수'],
  ['backend/utills/refundCore.js', 'ALREADY_REFUNDED', '이중 환불 방지'],
  ['backend/controllers/payController.js', "from '../utills/refundCore.js'", '건별 환불이 코어 사용'],
  ['backend/controllers/payController.js', 'REFUND_MODE.AUTO', '건별은 AUTO 모드'],
  ['backend/utills/marketCancellation.js', "from './refundCore.js'", '마켓 취소가 코어 사용'],
  ['backend/utills/marketCancellation.js', 'REFUND_MODE.FULL', '마켓 취소는 FULL 모드'],
  ['frontend/pages/B_host-seller/js/market.js', "handleBulkAction('refund')", '일괄 결제취소 유지'],
];
for (const [file, marker, label] of MARKERS) {
  const body = read(file);
  if (body === null) { check(`${label} (${file})`, false, '파일 없음'); continue; }
  check(`${label} — ${path.basename(file)}`, body.includes(marker), `'${marker.slice(0, 34)}' 없음`);
}

// 옛 중복 코드가 남아 있지 않은지
const mc = read('backend/utills/marketCancellation.js') || '';
check('마켓 취소에 중복 UPDATE 없음', !mc.includes("UPDATE applications SET status = 'Refunded'"));
const pc = read('backend/controllers/payController.js') || '';
check('건별 환불에 중복 cencelPayment 없음', !pc.includes('cencelPayment('));

/* ------------------------------------------------------------------ */
console.log('\n[2] 금액 계산 — 기존 동작 보존');
/* ------------------------------------------------------------------ */

// 결제사 호출과 UPDATE 를 기록하는 가짜 DB
function refundDb(payment, { columns = ['paymentKey', 'refundAmount', 'refundReason'] } = {}) {
  const updates = [];
  return {
    updates,
    async query(sql, params) {
      if (sql.includes('information_schema.columns')) {
        return [columns.map((c) => ({ c }))];
      }
      if (sql.includes('FROM payments p')) return [payment ? [payment] : []];
      updates.push({ sql: sql.trim().split('\n')[0], params });
      return [[]];
    },
  };
}

const PAID = {
  paymentId: 1, status: 'Paid', amount: 50000, paymentKey: null, refundAmount: null,
  hostId: 3, marketTitle: 'M', sellerId: 7, boothNumber: 'A-1', itemName: 'x', marketId: 5,
};
const REQUESTED = { ...PAID, status: 'RefundRequested', refundAmount: 20000 };

await (async () => {
  // 2-1) Paid + AUTO → 전액
  resetRefundSchemaCache();
  let db = refundDb(PAID);
  let r = await refundOneApplication(db, { applicationId: 1, reason: '사유', mode: REFUND_MODE.AUTO });
  check('Paid + AUTO → 전액 50,000', r.ok && r.refundedAmount === 50000, JSON.stringify(r));

  // 2-2) RefundRequested + AUTO → 부분 (기존 건별 환불의 핵심 동작)
  resetRefundSchemaCache();
  db = refundDb(REQUESTED);
  r = await refundOneApplication(db, { applicationId: 1, reason: '사유', mode: REFUND_MODE.AUTO });
  check('RefundRequested + AUTO → 부분 20,000', r.ok && r.refundedAmount === 20000, JSON.stringify(r));

  // 2-3) RefundRequested + FULL → 전액 (마켓 취소는 전액 환불 정책)
  resetRefundSchemaCache();
  db = refundDb(REQUESTED);
  r = await refundOneApplication(db, { applicationId: 1, reason: '사유', mode: REFUND_MODE.FULL });
  check('RefundRequested + FULL → 전액 50,000', r.ok && r.refundedAmount === 50000, JSON.stringify(r));

  // 2-4) 장부 갱신 확인
  resetRefundSchemaCache();
  db = refundDb(PAID);
  await refundOneApplication(db, { applicationId: 9, reason: '사유', mode: REFUND_MODE.AUTO });
  check('payments 를 Refunded 로', db.updates.some((u) => u.sql.includes('UPDATE payments') && u.sql.includes("'Refunded'")));
  check('applications 를 Refunded 로', db.updates.some((u) => u.sql.includes('UPDATE applications')));
  check('refundReason 기록', db.updates.some((u) => u.params && u.params.includes('사유')));
  check('refundAmount 기록', db.updates.some((u) => u.params && u.params.includes(50000)));
})();

/* ------------------------------------------------------------------ */
console.log('\n[3] 이중 환불 방지');
/* ------------------------------------------------------------------ */

await (async () => {
  resetRefundSchemaCache();
  const db = refundDb({ ...PAID, status: 'Refunded' });
  const r = await refundOneApplication(db, { applicationId: 1, reason: 'x', mode: REFUND_MODE.FULL });
  check('이미 환불된 건은 거부', r.ok === false && r.code === 'ALREADY_REFUNDED');
  check('거부 시 UPDATE 안 함', db.updates.length === 0, JSON.stringify(db.updates));

  resetRefundSchemaCache();
  const none = refundDb(null);
  const r2 = await refundOneApplication(none, { applicationId: 99, reason: 'x' });
  check('결제 내역 없으면 PAYMENT_NOT_FOUND', r2.ok === false && r2.code === 'PAYMENT_NOT_FOUND');
})();

/* ------------------------------------------------------------------ */
console.log('\n[4] 구 스키마 안전성');
/* ------------------------------------------------------------------ */

await (async () => {
  // paymentKey / refundAmount / refundReason 이 없는 DB
  resetRefundSchemaCache();
  const db = refundDb(PAID, { columns: [] });
  const schema = await getRefundSchema(db);
  check('컬럼 없음 감지', schema.paymentKey === false && schema.refundAmount === false);

  resetRefundSchemaCache();
  const db2 = refundDb(PAID, { columns: [] });
  const r = await refundOneApplication(db2, { applicationId: 1, reason: 'x' });
  check('컬럼 없어도 환불 진행', r.ok === true);
  const payUpdate = db2.updates.find((u) => u.sql.includes('UPDATE payments'));
  check('없는 컬럼은 SET 에서 제외', payUpdate && !payUpdate.sql.includes('refundReason'), payUpdate?.sql);

  resetRefundSchemaCache();
})();

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
process.exit(fail > 0 ? 1 : 0);
