// backend/scripts/verify-market-cancel.js
// [점검 스크립트] 마켓 취소 시 「전액 환불 + 신청자 알림 + 확인 절차」가 붙었는지 확인합니다.
// DB 도 서버도 필요 없습니다.
//
// 실행: cd backend && node scripts/verify-market-cancel.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  LIVE_STATUSES, REFUNDABLE_PAYMENT_STATUSES,
  buildCancelPreview, summarizePreview, resetCancellationCache,
} from '../utills/marketCancellation.js';

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
  ['backend/utills/marketCancellation.js', 'buildCancelPreview', '환불 미리보기'],
  ['backend/utills/marketCancellation.js', 'refundAllForMarket', '환불 실행'],
  ['backend/utills/marketCancellation.js', "status = 'Cancelled'", '미결제 신청 정리'],
  ['backend/utills/marketCancellation.js', 'getCancellationSchema', '컬럼 유무 흡수'],
  ['backend/controllers/dbdeleteController.js', 'CANCEL_CONFIRM_REQUIRED', '확인 없이는 거부'],
  ['backend/controllers/dbdeleteController.js', "type: 'market_cancelled'", '취소 알림'],
  ['backend/controllers/dbdeleteController.js', 'getCancelPreview', '미리보기 컨트롤러'],
  ['backend/routes/marketRoutes.js', "/:marketId/cancel-preview", '미리보기 라우트'],
  // [갱신] 취소 절차(미리보기 → 확인 모달 → 실행)를 common/js/market-cancel.js 로 공통화했습니다.
  //   마켓 상세 화면에서도 같은 버튼을 쓰게 되면서, 두 곳에 복사하면 갈라지기 때문입니다.
  ['frontend/common/js/market-cancel.js', 'function showConfirm', '확인 모달'],
  ['frontend/common/js/market-cancel.js', 'cancel-preview', '미리보기 호출'],
  ['frontend/common/js/market-cancel.js', 'confirmRefund', '확인 신호 전송'],
  ['frontend/common/js/market-cancel.js', '예, 환불하고 취소합니다', '예/아니오 버튼'],
  ['frontend/common/js/market-cancel.js', 'previewFailed', '미리보기 실패와 신청자 없음 구분'],
  ['frontend/pages/B_host-seller/js/marketdelete.js', 'MarketCancel.run', '내 마켓 관리가 공용 모듈 사용'],
  ['frontend/pages/B_host-seller/js/market.js', 'MarketCancel.run', '마켓 상세가 공용 모듈 사용'],
  ['frontend/pages/B_host-seller/js/market.js', 'applyHostActionState', '상태별 버튼 제어'],
  ['frontend/pages/B_host-seller/market-detail.html', 'id="edit-market-btn"', '상세에 수정 버튼'],
  ['frontend/pages/B_host-seller/market-detail.html', 'id="cancel-market-btn"', '상세에 취소 버튼'],
  ['frontend/pages/B_host-seller/market-detail.html', 'market-cancel.js', '상세가 공용 모듈 로드'],
  // [툴팁] 버튼 아래 상시 안내문 대신, 마우스를 올렸을 때만 뜨는 말풍선으로 바꿨습니다.
  ['frontend/pages/B_host-seller/market-detail.html', 'data-tip=', '버튼 툴팁 문구'],
  ['frontend/pages/B_host-seller/market-detail.html', 'has-tip', '툴팁 클래스'],
  ['frontend/common/css/style.css', '.has-tip::after', '툴팁 스타일'],
  ['frontend/common/css/style.css', 'focus-visible::after', '키보드 포커스에서도 표시'],
  ['frontend/common/css/style.css', '@media (hover: none)', '터치 기기 처리'],
  ['frontend/pages/B_host-seller/mymarketpage.html', 'market-cancel.js', '내 마켓 관리가 공용 모듈 로드'],
  ['frontend/pages/B_host-seller/mymarketpage.html', 'marketdelete.js?v=', '캐시 버전 표기'],
  ['frontend/common/css/style.css', '.cancel-modal', '모달 스타일'],
  ['frontend/common/css/style.css', '.cancel-table', '내역 표 스타일'],
];

for (const [file, marker, label] of MARKERS) {
  const body = read(file);
  if (body === null) { check(`${label} (${file})`, false, '파일 없음'); continue; }
  check(`${label} — ${path.basename(file)}`, body.includes(marker), `'${marker.slice(0, 34)}' 없음`);
}

/* ------------------------------------------------------------------ */
console.log('\n[2] 대상 상태값');
/* ------------------------------------------------------------------ */

check('처리 대상에 Pending 포함', LIVE_STATUSES.includes('Pending'));
check('처리 대상에 Approved 포함', LIVE_STATUSES.includes('Approved'));
check('처리 대상에 Paid 포함', LIVE_STATUSES.includes('Paid'));
check('이미 환불된 건은 제외', !LIVE_STATUSES.includes('Refunded'));
check('반려된 건은 제외', !LIVE_STATUSES.includes('Rejected'));
check('환불 대상 결제 상태 = Paid + RefundRequested',
  REFUNDABLE_PAYMENT_STATUSES.join(',') === 'Paid,RefundRequested');

/* ------------------------------------------------------------------ */
console.log('\n[3] 부스 종류별 집계');
/* ------------------------------------------------------------------ */

// A 부스: 결제 2건(30,000 x2) + 미결제 1건
// B 부스: 결제 1건(50,000)
// 종류 없음(기본): 미결제 1건
const ROWS = [
  { applicationId: 1, sellerId: 7, status: 'Paid', boothNumber: 'A-1', itemName: 'x', boothTypeName: 'A', sellerNickname: '가', paymentId: 11, paidAmount: 30000, paymentStatus: 'Paid' },
  { applicationId: 2, sellerId: 8, status: 'Paid', boothNumber: 'A-2', itemName: 'x', boothTypeName: 'A', sellerNickname: '나', paymentId: 12, paidAmount: 30000, paymentStatus: 'Paid' },
  { applicationId: 3, sellerId: 9, status: 'Approved', boothNumber: 'A-3', itemName: 'x', boothTypeName: 'A', sellerNickname: '다', paymentId: null, paidAmount: null, paymentStatus: null },
  { applicationId: 4, sellerId: 7, status: 'Paid', boothNumber: 'B-1', itemName: 'x', boothTypeName: 'B', sellerNickname: '가', paymentId: 13, paidAmount: 50000, paymentStatus: 'Paid' },
  { applicationId: 5, sellerId: 10, status: 'Pending', boothNumber: 'C-1', itemName: 'x', boothTypeName: '기본', sellerNickname: '라', paymentId: null, paidAmount: null, paymentStatus: null },
];

function previewDb(rows) {
  return {
    async query(sql) {
      if (sql.includes('information_schema.columns')) {
        return [[{ c: 'paymentKey' }, { c: 'refundAmount' }, { c: 'refundReason' }, { c: 'boothTypeId' }]];
      }
      return [rows];
    },
  };
}

await (async () => {
  resetCancellationCache();
  const p = await buildCancelPreview(previewDb(ROWS), 5);

  check('종류 3그룹으로 묶임', p.byBoothType.length === 3, JSON.stringify(p.byBoothType.map((g) => g.boothTypeName)));

  const a = p.byBoothType.find((g) => g.boothTypeName === 'A');
  check('A: 결제 2건', a.paidCount === 2, String(a.paidCount));
  check('A: 환불 60,000원', a.refundTotal === 60000, String(a.refundTotal));
  check('A: 결제 전 1건', a.unpaidCount === 1, String(a.unpaidCount));

  const b = p.byBoothType.find((g) => g.boothTypeName === 'B');
  check('B: 결제 1건 50,000원', b.paidCount === 1 && b.refundTotal === 50000);

  check('총 환불 3건', p.refundCount === 3, String(p.refundCount));
  check('총 환불 110,000원', p.refundTotal === 110000, String(p.refundTotal));
  check('결제 전 총 2건', p.unpaidCount === 2, String(p.unpaidCount));
  // 판매자 7번은 A-1 과 B-1 두 건 → 사람 수는 4명
  check('신청자는 사람 수로 셈 (중복 제거)', p.sellerCount === 4, String(p.sellerCount));

  const summary = summarizePreview(p);
  check('요약 문구에 종류별 금액', summary.includes('A 2건 60,000원') && summary.includes('B 1건 50,000원'), summary);
  check('요약 문구에 총액', summary.includes('110,000원'), summary);

  // 신청자가 없는 마켓
  resetCancellationCache();
  const empty = await buildCancelPreview(previewDb([]), 5);
  check('신청자 없으면 환불 0', empty.refundCount === 0 && empty.refundTotal === 0);
  check('신청자 없으면 안내 문구', summarizePreview(empty) === '신청자가 없습니다.');

  resetCancellationCache();
})();

/* ------------------------------------------------------------------ */
console.log('\n[4] 구 스키마 안전성');
/* ------------------------------------------------------------------ */

await (async () => {
  // paymentKey / boothTypeId 가 없는 DB — 취소가 500 으로 죽으면 안 됩니다.
  resetCancellationCache();
  const oldDb = {
    async query(sql) {
      if (sql.includes('information_schema.columns')) return [[]];
      if (sql.includes('market_booth_types')) throw new Error('테이블 없음');
      return [[{
        applicationId: 1, sellerId: 7, status: 'Paid', boothNumber: 'A-1', itemName: 'x',
        boothTypeName: '기본', sellerNickname: '가', paymentId: 11, paidAmount: 30000, paymentStatus: 'Paid',
      }]];
    },
  };
  const p = await buildCancelPreview(oldDb, 5);
  check('부스 종류 없어도 집계됨', p.refundCount === 1 && p.refundTotal === 30000);
  check('종류 없으면 "기본" 그룹', p.byBoothType[0].boothTypeName === '기본');

  resetCancellationCache();
})();

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
if (fail > 0) {
  console.log('\n실패 항목이 있으면 패치가 일부 폴더만 덮어써졌을 가능성이 큽니다.');
}
process.exit(fail > 0 ? 1 : 0);
