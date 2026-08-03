// backend/scripts/verify-host-actions.js
// [점검 스크립트] 두 가지를 확인합니다.
//   1) 결제 화면에 뜨던 「오류」 문구가 사라졌는지
//   2) 마켓 상세에 주최자 관리 버튼(수정/마감/취소)이 붙었는지
//
// DB 도 서버도 필요 없습니다. 파일 검사만 합니다.
// 실행: cd backend && node scripts/verify-host-actions.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
console.log('\n[1] 결제 화면 「오류」 문구');
/* ------------------------------------------------------------------ */

const payJs = read('frontend/pages/B_host-seller/js/payment.js');
if (!payJs) {
  check('payment.js 존재', false, '파일 없음');
} else {
  // 원인: 결제 화면(payment.html)에는 #payment-list 가 없는데 payment_history() 가
  //       무조건 실행돼 renderPaymentGroups 안에서 null.innerHTML 로 터졌고,
  //       catch 가 그걸 잡아 renderAlert("오류") 를 띄웠습니다.
  check('renderAlert("오류") 제거됨', !/renderAlert\(\s*["']오류["']\s*\)/.test(payJs));
  check('내역 영역 없으면 조기 반환', payJs.includes("const listEl = document.getElementById('payment-list');")
    && /if \(!listEl\) return;/.test(payJs));
  check('renderPaymentGroups 널 방어', /const ui = document\.getElementById\('payment-list'\);[\s\S]{0,120}if \(!ui\) return;/.test(payJs));
  check('실패해도 결제 금액 영역은 안 건드림', !/renderAlert\([^)]*\)[^\n]*payment-list/.test(payJs));
  check('오류는 콘솔에 남김', payJs.includes("console.error('결제 내역 조회 실패:'"));
  check('디버그 console.log 정리', !payJs.includes('console.log('));
}

const payHtml = read('frontend/pages/B_host-seller/payment.html');
check('payment.js 캐시 버전 갱신', !!payHtml && /payment\.js\?v=\d+/.test(payHtml));
check('결제 화면에는 내역 영역이 없음(전제 확인)',
  !!payHtml && !payHtml.includes('id="payment-list"'));

/* ------------------------------------------------------------------ */
console.log('\n[2] 마켓 상세 주최자 관리 버튼');
/* ------------------------------------------------------------------ */

const detailHtml = read('frontend/pages/B_host-seller/market-detail.html');
if (!detailHtml) {
  check('market-detail.html 존재', false, '파일 없음');
} else {
  check('수정하기 버튼', detailHtml.includes('id="edit-market-btn"'));
  check('취소하기 버튼', detailHtml.includes('id="cancel-market-btn"'));
  check('기존 마감 버튼 유지', detailHtml.includes('id="close-market-btn"'));
  check('안내문 영역', detailHtml.includes('id="host-actions-hint"'));
  check('market.js 캐시 버전 갱신', /market\.js\?v=\d+/.test(detailHtml));
}

const marketJs = read('frontend/pages/B_host-seller/js/market.js');
if (!marketJs) {
  check('market.js 존재', false, '파일 없음');
} else {
  check('수정 핸들러', marketJs.includes('function handleMarketEditClick'));
  check('취소 핸들러', marketJs.includes('function handleMarketCancelClick'));
  check('상태별 버튼 제어', marketJs.includes('function applyHostActionState'));
  check('수정 화면으로 이동', marketJs.includes('correctionMarket?marketId='));
  check('취소는 확인 창이 있는 화면으로', marketJs.includes('mymarketpage?highlight='));
  check('상세 렌더 시 상태 반영', marketJs.includes('applyHostActionState(market);'));
  check('초기화에 연결', marketJs.includes('handleMarketEditClick();')
    && marketJs.includes('handleMarketCancelClick();'));
}

const delJs = read('frontend/pages/B_host-seller/js/marketdelete.js');
if (!delJs) {
  check('marketdelete.js 존재', false, '파일 없음');
} else {
  check('highlight 파라미터 처리', delJs.includes("get('highlight')"));
  check('해당 마켓 펼치기', delJs.includes('if (highlightId) expandedId = highlightId;'));
  check('그 위치로 스크롤', delJs.includes('scrollIntoView'));
  check('강조는 일시적', delJs.includes("target.classList.remove('market-highlight')"));
}

const css = read('frontend/common/css/style.css');
check('관리 버튼 스타일', !!css && css.includes('.host-actions'));
check('강조 애니메이션', !!css && css.includes('market-highlight-fade'));

console.log('\n=========================================');
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('=========================================');
if (failures.length) { console.log('\n실패 목록:'); failures.forEach((f) => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
