// backend/utills/marketCancellation.js
// [마켓 취소 - 신규 파일]
//
// 담는 것: 주최자가 마켓을 취소할 때 "누구에게 얼마를 돌려줘야 하는지" 계산과 실제 환불 실행.
//
// 왜 만들었나
//   기존 취소(dbdeleteController.deleteMarket)는 딱 한 줄이었습니다.
//     UPDATE markets SET isExpired = 2 WHERE marketId = ?
//   그래서 이런 상태가 됐습니다.
//     - 판매자는 통보를 못 받고, 화면에서 마켓만 조용히 사라짐
//     - applications 는 Paid 인 채로 남고, 돈은 주최자 쪽에 그대로
//   기능정의서 확정 정책은 「주최자가 마켓 취소 시 전액 환불 + 주최자 페널티」입니다.
//
// 설계 요점
//   1) 취소 전에 반드시 미리보기를 거칩니다. 돈이 나가는 동작이라 주최자가
//      "얼마가 빠져나가는지" 모른 채 누르면 안 됩니다.
//      화면뿐 아니라 서버에서도 confirmRefund 없이는 거부합니다. (API 직접 호출 차단)
//   2) 환불은 부스 종류(A/B/C)별로 묶어서 보여줍니다. 주최자가 규모를 바로 가늠할 수 있습니다.
//   3) 환불 실패가 나도 마켓 취소는 진행합니다.
//      취소를 막으면 판매자에게 통보조차 못 가고, 주최자는 아무것도 못 하는 상태가 됩니다.
//      실패 건은 목록으로 돌려주고, 기존 건별 환불 API 로 재시도하게 합니다.

// [정리] 환불 1건의 절차(결제사 취소 + payments/applications 갱신)는
//        utills/refundCore.js 한 곳에 있습니다. 건별 환불·일괄 결제취소와 같은 코드를 씁니다.
//        예전에는 여기서 따로 구현해서, RefundRequested 건의 처리가 서로 달랐습니다.
import { refundOneApplication, REFUND_MODE } from './refundCore.js';

/** 아직 살아 있는(취소 시 처리해야 하는) 신청 상태 */
export const LIVE_STATUSES = ['Pending', 'Approved', 'Paid', 'RefundRequested'];

/** 실제로 돈이 들어와 있어 돌려줘야 하는 결제 상태 */
export const REFUNDABLE_PAYMENT_STATUSES = ['Paid', 'RefundRequested'];

/* ------------------------------------------------------------------ */
/* 스키마 확인                                                          */
/* ------------------------------------------------------------------ */

const MISSING_TTL_MS = 60 * 1000;
const PRESENT_TTL_MS = 10 * 60 * 1000;

let schemaCache = null;
let schemaExpires = 0;

export function resetCancellationCache() {
  schemaCache = null;
  schemaExpires = 0;
}

/**
 * 환불에 필요한 컬럼이 있는지 확인합니다.
 * 팀마다 마이그레이션 시점이 달라, 없는 컬럼을 SELECT 하면 취소 자체가 500 으로 죽습니다.
 */
export async function getCancellationSchema(db) {
  const now = Date.now();
  if (schemaCache && now < schemaExpires) return schemaCache;

  let state = { paymentKey: false, refundAmount: false, refundReason: false, boothType: false };
  try {
    const [payCols] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'payments'`
    );
    // [대소문자] 정규화하지 않으면 컬럼이 있는데도 환불 기록을 건너뛰게 됩니다.
    const payNames = new Set(payCols.map((r) => String(r.c).toLowerCase()));

    const [appCols] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'applications'
          AND column_name = 'boothTypeId'`
    );

    state = {
      paymentKey: payNames.has('paymentkey'),
      refundAmount: payNames.has('refundamount'),
      refundReason: payNames.has('refundreason'),
      boothType: appCols.length > 0,
    };
  } catch (error) {
    console.warn('[marketCancellation] 스키마 확인 실패:', error.message);
  }

  schemaCache = state;
  schemaExpires = now + (state.paymentKey ? PRESENT_TTL_MS : MISSING_TTL_MS);
  return schemaCache;
}

/* ------------------------------------------------------------------ */
/* 미리보기                                                            */
/* ------------------------------------------------------------------ */

/**
 * 이 마켓을 취소하면 무슨 일이 벌어지는지 계산합니다. (DB 를 바꾸지 않습니다)
 *
 * @returns {Promise<{
 *   marketId:number, marketTitle:string,
 *   byBoothType: Array<{ boothTypeName:string, paidCount:number, refundTotal:number, unpaidCount:number }>,
 *   refundCount:number, refundTotal:number,
 *   unpaidCount:number, sellerCount:number,
 *   items: Array<object>
 * }>}
 */
export async function buildCancelPreview(db, marketId) {
  const schema = await getCancellationSchema(db);

  // 부스 종류 이름 — 컬럼이 없는 DB 에서는 전부 '기본'으로 묶습니다.
  const typeNameExpr = schema.boothType ? "COALESCE(bt.name, '기본')" : "'기본'";
  const typeJoin = schema.boothType
    ? 'LEFT JOIN market_booth_types bt ON bt.boothTypeId = a.boothTypeId'
    : '';

  const [rows] = await db.query(
    `SELECT a.applicationId, a.sellerId, a.status, a.boothNumber, a.itemName,
            ${typeNameExpr} AS boothTypeName,
            u.nickname AS sellerNickname,
            p.paymentId, p.amount AS paidAmount, p.status AS paymentStatus
       FROM applications a
       ${typeJoin}
       LEFT JOIN users u ON u.userId = a.sellerId
       LEFT JOIN payments p
              ON p.applicationId = a.applicationId
             AND p.status IN (${REFUNDABLE_PAYMENT_STATUSES.map(() => '?').join(', ')})
      WHERE a.marketId = ?
        AND a.status IN (${LIVE_STATUSES.map(() => '?').join(', ')})
      ORDER BY ${schema.boothType ? 'bt.sortOrder, ' : ''}a.applicationId`,
    [...REFUNDABLE_PAYMENT_STATUSES, marketId, ...LIVE_STATUSES]
  );

  const groups = new Map();
  let refundCount = 0;
  let refundTotal = 0;
  let unpaidCount = 0;
  const sellers = new Set();

  for (const r of rows) {
    const key = r.boothTypeName || '기본';
    if (!groups.has(key)) {
      groups.set(key, { boothTypeName: key, paidCount: 0, refundTotal: 0, unpaidCount: 0 });
    }
    const g = groups.get(key);
    sellers.add(Number(r.sellerId));

    if (r.paymentId) {
      const amount = Number(r.paidAmount) || 0;
      g.paidCount += 1;
      g.refundTotal += amount;
      refundCount += 1;
      refundTotal += amount;
    } else {
      g.unpaidCount += 1;
      unpaidCount += 1;
    }
  }

  return {
    marketId: Number(marketId),
    byBoothType: [...groups.values()],
    refundCount,
    refundTotal,
    unpaidCount,
    sellerCount: sellers.size,
    items: rows.map((r) => ({
      applicationId: Number(r.applicationId),
      sellerId: Number(r.sellerId),
      sellerNickname: r.sellerNickname,
      boothNumber: r.boothNumber,
      boothTypeName: r.boothTypeName || '기본',
      status: r.status,
      paidAmount: r.paymentId ? Number(r.paidAmount) || 0 : 0,
      isPaid: !!r.paymentId,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 환불 실행                                                            */
/* ------------------------------------------------------------------ */

/**
 * 미리보기에서 계산한 대상들에게 실제로 전액 환불을 실행하고, 신청 상태를 정리합니다.
 *
 * 실패해도 예외를 던지지 않습니다. 건별로 성공/실패를 모아 돌려주고,
 * 호출한 쪽이 마켓 취소를 계속 진행할 수 있게 합니다.
 *
 * @returns {Promise<{ refunded:Array, failed:Array, cancelledUnpaid:number }>}
 */
export async function refundAllForMarket(db, { marketId, preview, reason }) {
  const refunded = [];
  const failed = [];

  const paidItems = preview.items.filter((i) => i.isPaid);

  for (const item of paidItems) {
    try {
      // 마켓 취소는 주최자 사정이므로 정책상 무조건 전액 환불입니다.
      //   (판매자가 부분 환불을 요청해 둔 RefundRequested 건도 전액으로 돌려줍니다)
      const result = await refundOneApplication(db, {
        applicationId: item.applicationId,
        reason: reason || '주최자의 마켓 취소로 인한 전액 환불',
        mode: REFUND_MODE.FULL,
      });

      if (!result.ok) {
        // 이미 환불된 건(일괄 결제취소로 먼저 처리한 경우 등)은 실패가 아니라 건너뜀입니다.
        if (result.code === 'ALREADY_REFUNDED') continue;
        failed.push({ ...item, error: result.message });
        continue;
      }

      refunded.push({ ...item, refundedAmount: result.refundedAmount });
    } catch (error) {
      console.error(`[marketCancellation] 환불 실패 (applicationId=${item.applicationId}):`, error.message);
      failed.push({ ...item, error: error.message });
    }
  }

  // 결제 전 신청은 돌려줄 돈이 없으므로 상태만 정리합니다.
  //   'Cancelled' 는 applications.status 가 varchar 라 스키마 변경 없이 쓸 수 있습니다.
  const [cancelResult] = await db.query(
    `UPDATE applications SET status = 'Cancelled'
      WHERE marketId = ? AND status IN ('Pending', 'Approved')`,
    [marketId]
  );

  return { refunded, failed, cancelledUnpaid: cancelResult.affectedRows || 0 };
}

/** 미리보기를 사람이 읽는 한 줄로 (알림·로그용) */
export function summarizePreview(preview) {
  if (!preview || preview.sellerCount === 0) return '신청자가 없습니다.';
  const parts = preview.byBoothType.map(
    (g) => `${g.boothTypeName} ${g.paidCount}건 ${g.refundTotal.toLocaleString()}원`
  );
  return `${parts.join(' / ')} — 총 ${preview.refundCount}건 ${preview.refundTotal.toLocaleString()}원`;
}

export default {
  LIVE_STATUSES,
  REFUNDABLE_PAYMENT_STATUSES,
  getCancellationSchema,
  resetCancellationCache,
  buildCancelPreview,
  refundAllForMarket,
  summarizePreview,
};
