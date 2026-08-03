// backend/utills/refundCore.js
// [환불 공통 코어 - 신규 파일]
//
// 담는 것: "환불 1건"을 처리하는 절차. 결제사 취소 + payments/applications 상태 갱신.
//
// 왜 만들었나
//   환불 경로가 세 개인데 처리 절차가 두 곳에 복사돼 있었습니다.
//     ① 건별 환불        payController.refundPayment          (판매자 요청 → 주최자 처리)
//     ② 일괄 결제취소     위 API 를 화면에서 N번 호출            (주최자가 체크로 선택)
//     ③ 마켓 취소 전액환불 marketCancellation.refundAllForMarket (마켓 취소)
//   ①②는 같은 코드를 쓰지만 ③이 따로 구현돼 있었고, 실제로 동작이 갈렸습니다.
//   ①은 RefundRequested 건을 refundAmount 만큼 부분 취소하는데 ③은 전액 취소했습니다.
//   (마켓 취소는 전액이 맞지만, 같은 일을 하는 코드가 두 곳에서 다르게 도는 건 사고의 씨앗입니다)
//   그래서 절차를 여기 한 곳으로 모으고, 세 경로가 전부 이 함수를 부르게 했습니다.
//
// 알림은 여기 넣지 않습니다.
//   경로마다 문구가 달라야 하기 때문입니다.
//     건별/일괄 → "환불이 완료되었습니다" (refund_completed)
//     마켓 취소 → "마켓이 취소되었습니다" (market_cancelled)
//   알림은 부르는 쪽이 각자 보냅니다.

/** 환불 금액을 정하는 방식 */
export const REFUND_MODE = {
  // 기존 건별 환불의 규칙을 그대로 지킵니다.
  //   Paid            → 전액
  //   RefundRequested → 판매자가 요청해 미리 계산해둔 refundAmount 만큼 부분 취소
  AUTO: 'auto',
  // 마켓 취소처럼 무조건 전액을 돌려주는 경우.
  FULL: 'full',
};

// paymentService 는 axios 에 의존합니다. 파일 맨 위에서 import 하면
// 환불을 실제로 하지 않는 경로(점검 스크립트 등)까지 결제 모듈을 끌고 옵니다.
async function loadCancelPayment() {
  const mod = await import('../services/paymentService.js');
  return mod.cencelPayment;
}

/* ------------------------------------------------------------------ */
/* 스키마 확인                                                          */
/* ------------------------------------------------------------------ */

const PRESENT_TTL_MS = 10 * 60 * 1000;
const MISSING_TTL_MS = 60 * 1000;

let schemaCache = null;
let schemaExpires = 0;

export function resetRefundSchemaCache() {
  schemaCache = null;
  schemaExpires = 0;
}

/** payments 에 어떤 컬럼이 있는지 — 없는 컬럼을 쓰면 환불이 통째로 500 이 됩니다. */
export async function getRefundSchema(db) {
  const now = Date.now();
  if (schemaCache && now < schemaExpires) return schemaCache;

  let state = { paymentKey: false, refundAmount: false, refundReason: false };
  try {
    const [cols] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'payments'`
    );
    // [대소문자] 정규화하지 않으면 컬럼이 있는데도 환불 금액·사유가 기록되지 않습니다.
    const names = new Set(cols.map((r) => String(r.c).toLowerCase()));
    state = {
      paymentKey: names.has('paymentkey'),
      refundAmount: names.has('refundamount'),
      refundReason: names.has('refundreason'),
    };
  } catch (error) {
    console.warn('[refundCore] 스키마 확인 실패:', error.message);
  }

  schemaCache = state;
  schemaExpires = now + (state.paymentKey ? PRESENT_TTL_MS : MISSING_TTL_MS);
  return schemaCache;
}

/* ------------------------------------------------------------------ */
/* 조회                                                                */
/* ------------------------------------------------------------------ */

/**
 * 환불에 필요한 결제·신청·마켓 정보를 한 번에 읽습니다.
 * 부르는 쪽에서 권한 확인(hostId)과 알림 문구에 그대로 씁니다.
 */
export async function loadRefundTarget(db, applicationId) {
  const schema = await getRefundSchema(db);
  const extra = [
    schema.paymentKey ? 'p.paymentKey' : 'NULL AS paymentKey',
    schema.refundAmount ? 'p.refundAmount' : 'NULL AS refundAmount',
  ].join(', ');

  const [rows] = await db.query(
    `SELECT p.paymentId, p.status, p.amount, ${extra},
            m.hostId, m.title AS marketTitle,
            a.sellerId, a.boothNumber, a.itemName, a.marketId
       FROM payments p
       JOIN applications a ON a.applicationId = p.applicationId
       JOIN markets m ON m.marketId = a.marketId
      WHERE p.applicationId = ?`,
    [applicationId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/* ------------------------------------------------------------------ */
/* 환불 실행                                                            */
/* ------------------------------------------------------------------ */

/**
 * 환불 1건을 처리합니다. 알림은 보내지 않습니다.
 *
 * @param db pool 또는 트랜잭션 커넥션
 * @param {object} opts
 *   applicationId  대상 신청
 *   reason         환불 사유 (payments.refundReason 에 기록)
 *   mode           REFUND_MODE.AUTO(기본) | REFUND_MODE.FULL
 *   payment        이미 읽어둔 결제 행이 있으면 넘겨서 재조회를 아낍니다 (선택)
 *
 * @returns {Promise<{ ok:true, refundedAmount:number, payment:object }
 *                 | { ok:false, code:string, message:string, payment?:object }>}
 *   실패해도 예외를 던지지 않는 것은 "조회·상태" 문제일 때뿐입니다.
 *   결제사 호출이 실패하면 예외가 그대로 올라갑니다 — 돈이 안 빠져나갔는데
 *   장부만 환불로 바꾸는 것이 가장 위험하기 때문입니다.
 */
export async function refundOneApplication(db, {
  applicationId,
  reason,
  mode = REFUND_MODE.AUTO,
  payment: prefetched = null,
} = {}) {
  const schema = await getRefundSchema(db);
  const payment = prefetched || await loadRefundTarget(db, applicationId);

  if (!payment) {
    return { ok: false, code: 'PAYMENT_NOT_FOUND', message: '결제 내역을 찾을 수 없습니다.' };
  }

  // [이중 환불 방지] 이미 환불된 건에 또 실행되면 결제사에 두 번 취소를 걸게 됩니다.
  //   마켓 취소와 일괄 결제취소가 같은 건을 건드릴 수 있어 여기서 한 번 더 막습니다.
  if (payment.status === 'Refunded') {
    return { ok: false, code: 'ALREADY_REFUNDED', message: '이미 환불된 결제입니다.', payment };
  }

  const fullAmount = Number(payment.amount) || 0;
  const requested = Number(payment.refundAmount) || 0;

  // 부분 환불은 "판매자가 요청해 금액이 계산된" RefundRequested 건에만 적용합니다.
  const isPartial = mode === REFUND_MODE.AUTO
    && payment.status === 'RefundRequested'
    && requested > 0;

  const refundedAmount = isPartial ? requested : fullAmount;

  // 결제사 취소.
  //   paymentKey 가 없으면(모의 결제 등) 보낼 키가 없으므로 장부만 정리합니다.
  if (schema.paymentKey && payment.paymentKey) {
    const cencelPayment = await loadCancelPayment();
    if (isPartial) {
      await cencelPayment(payment.paymentKey, reason || '환불 승인 처리', refundedAmount);
    } else {
      await cencelPayment(payment.paymentKey, reason || '주최자 요청에 의한 환불');
    }
  }

  // 장부 정리 — 없는 컬럼은 건너뜁니다.
  const sets = ["status = 'Refunded'"];
  const params = [];
  if (schema.refundReason) { sets.push('refundReason = ?'); params.push(reason || null); }
  if (schema.refundAmount) { sets.push('refundAmount = ?'); params.push(refundedAmount); }
  params.push(applicationId);

  await db.query(`UPDATE payments SET ${sets.join(', ')} WHERE applicationId = ?`, params);
  await db.query("UPDATE applications SET status = 'Refunded' WHERE applicationId = ?", [applicationId]);

  return { ok: true, refundedAmount, payment };
}

export default {
  REFUND_MODE,
  getRefundSchema,
  resetRefundSchemaCache,
  loadRefundTarget,
  refundOneApplication,
};
