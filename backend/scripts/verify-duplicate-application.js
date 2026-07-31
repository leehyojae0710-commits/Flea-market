// backend/scripts/verify-duplicate-application.js
// [중복 부스 신청 안내] 적용 확인 스크립트
//
// 실행: cd backend && node scripts/verify-duplicate-application.js
//
// DB 연결도, 서버 기동도 필요 없습니다. 두 가지를 봅니다.
//   1) 패치 마커 검사 — 파일이 폴더 단위로 부분 적용됐는지 확인 (지금까지 이 사고가 반복됐음)
//   2) 판정 시나리오 — utills/duplicateApplication.js 의 계산 결과가 기대와 맞는지

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  attachDuplicateToMarketApplications,
  attachDuplicateToMyApplications,
  summarizeDuplicates,
  formatBoothList,
  isCountedStatus,
} from '../utills/duplicateApplication.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, '..');
const ROOT = path.resolve(BACKEND, '..');
const FRONT = path.join(ROOT, 'frontend');

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

function fileHas(relPath, marker, label) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return check(label, false, `파일 없음: ${relPath}`);
  const text = fs.readFileSync(full, 'utf8');
  check(label, text.includes(marker), `${relPath} 안에 "${marker}" 없음`);
}

/* ================================================================ */
console.log('\n[1] 패치 마커 검사 (파일이 전부 덮어써졌는지)');
console.log('----------------------------------------------------');

fileHas('backend/utills/duplicateApplication.js', 'getSellerDuplicateState', '신규 모듈 duplicateApplication.js');
fileHas('backend/controllers/applicationController.js', "from '../utills/duplicateApplication.js'", 'applicationController: 모듈 import');
fileHas('backend/controllers/applicationController.js', 'checkDuplicateApplication', 'applicationController: 사전확인 API');
fileHas('backend/controllers/applicationController.js', "type: 'application_duplicate'", 'applicationController: 중복 알림 발송');
fileHas('backend/controllers/applicationController.js', 'attachDuplicateToMyApplications', 'applicationController: 내 목록에 중복 정보 부착');
fileHas('backend/controllers/marketController.js', 'attachDuplicateToMarketApplications', 'marketController: 신청자 목록에 중복 정보 부착');
fileHas('backend/controllers/marketController.js', 'duplicateSummary', 'marketController: 요약 응답');
fileHas('backend/routes/applicationRoutes.js', "router.get('/duplicate-check'", 'applicationRoutes: GET /applications/duplicate-check');

fileHas('frontend/pages/B_host-seller/js/market.js', 'renderDuplicateBadge', 'market.js: 주최자 목록 중복 배지');
fileHas('frontend/pages/B_host-seller/js/market.js', 'renderApplicationDuplicateSummary', 'market.js: 주최자 목록 요약');
fileHas('frontend/pages/B_host-seller/js/market.js', 'confirmDuplicateBeforeApply', 'market.js: 신청 직전 확인');
fileHas('frontend/pages/B_host-seller/js/market.js', 'renderSameMarketDuplicateNotice', 'market.js: 신청 화면 안내 배너');
fileHas('frontend/pages/B_host-seller/js/mybooth.js', 'renderMyDuplicateBadge', 'mybooth.js: 판매자 카드 중복 배지');
fileHas('frontend/pages/B_host-seller/js/mybooth.js', 'renderMyDuplicateSummary', 'mybooth.js: 판매자 요약');
fileHas('frontend/pages/B_host-seller/market-detail.html', 'application-duplicate-only', 'market-detail.html: 중복만 보기 체크박스');
fileHas('frontend/pages/B_host-seller/market-detail.html', 'application-duplicate-summary', 'market-detail.html: 요약 영역');
fileHas('frontend/pages/B_host-seller/booth-apply.html', 'duplicate-notice', 'booth-apply.html: 안내 배너 영역');
fileHas('frontend/pages/B_host-seller/mybooth.html', 'booth-duplicate-summary', 'mybooth.html: 요약 영역');
fileHas('frontend/pages/B_host-seller/css/host-seller.css', '.dup-badge', 'host-seller.css: 배지 스타일');
fileHas('frontend/common/js/global-nav.js', 'application_duplicate', 'global-nav.js: 알림 태그 라벨');

// 캐시 무효화(버전 올림)까지 됐는지 — 안 올리면 브라우저가 옛 JS 를 계속 씁니다.
const detailHtml = fs.existsSync(path.join(FRONT, 'pages/B_host-seller/market-detail.html'))
  ? fs.readFileSync(path.join(FRONT, 'pages/B_host-seller/market-detail.html'), 'utf8') : '';
check('market-detail.html: market.js 캐시 버전 v14', detailHtml.includes('js/market.js?v=14'));

/* ================================================================ */
console.log('\n[2] 판정 시나리오');
console.log('----------------------------------------------------');

// 시나리오 A — 주최자 신청자 목록
//   판매자 7: 3건 점유(Pending/Approved/Paid) + 반려 1건  -> 중복 3
//   판매자 8: 1건                                          -> 중복 아님
//   판매자 9: 환불완료 2건                                 -> 점유 0, 중복 아님
const hostRows = [
  { applicationId: 1, sellerId: 7, boothNumber: '1', status: 'Pending' },
  { applicationId: 2, sellerId: 7, boothNumber: '2', status: 'Approved' },
  { applicationId: 3, sellerId: 7, boothNumber: '3', status: 'Paid' },
  { applicationId: 4, sellerId: 7, boothNumber: '4', status: 'Rejected' },
  { applicationId: 5, sellerId: 8, boothNumber: '5', status: 'Pending' },
  { applicationId: 6, sellerId: 9, boothNumber: '6', status: 'Refunded' },
  { applicationId: 7, sellerId: 9, boothNumber: '7', status: 'Refunded' },
];
const host = attachDuplicateToMarketApplications(hostRows);
const byId = (id) => host.find((r) => r.applicationId === id);

check('판매자 7: 점유 3건이 중복 3으로 계산', byId(1).sellerDuplicateCount === 3, `실제 ${byId(1).sellerDuplicateCount}`);
check('반려 건에도 판매자 기준 카운트가 붙음(3)', byId(4).sellerDuplicateCount === 3, `실제 ${byId(4).sellerDuplicateCount}`);
check('반려 건 자체는 카운트에 포함되지 않음(4가 아님)', byId(4).sellerDuplicateCount !== 4);
check('판매자 8: 1건이면 중복 아님', byId(5).isDuplicateSeller === false);
check('판매자 9: 환불완료만 있으면 점유 0', byId(6).sellerDuplicateCount === 0, `실제 ${byId(6).sellerDuplicateCount}`);
check('부스 번호 목록이 함께 내려감', JSON.stringify(byId(1).sellerDuplicateBooths) === JSON.stringify(['1', '2', '3']));

const summary = summarizeDuplicates(host);
check('요약: 중복 판매자 1명', summary.duplicateSellers === 1, `실제 ${summary.duplicateSellers}`);
check('요약: 중복 신청 3건', summary.duplicateApplications === 3, `실제 ${summary.duplicateApplications}`);

// 시나리오 B — 판매자 내 부스 목록 (마켓 단위)
const myRows = [
  { applicationId: 11, marketId: 100, boothNumber: 'A1', status: 'Pending' },
  { applicationId: 12, marketId: 100, boothNumber: 'A2', status: 'Paid' },
  { applicationId: 13, marketId: 200, boothNumber: 'B1', status: 'Approved' },
];
const mine = attachDuplicateToMyApplications(myRows);
check('같은 마켓 2건 -> 중복 2', mine[0].marketDuplicateCount === 2, `실제 ${mine[0].marketDuplicateCount}`);
check('다른 마켓 1건 -> 중복 아님', mine[2].isDuplicateInMarket === false);
check('마켓별로 따로 셈(100과 200이 섞이지 않음)', mine[2].marketDuplicateCount === 1);

// 시나리오 C — 유틸
check('Pending 은 점유 상태', isCountedStatus('Pending') === true);
check('Rejected 는 점유 아님', isCountedStatus('Rejected') === false);
check('RefundRequested 는 점유 아님(게이지 기준과 동일)', isCountedStatus('RefundRequested') === false);
check('부스 목록 문자열 5개 초과 시 축약', formatBoothList(['1', '2', '3', '4', '5', '6']).includes('외 1건'));
check('빈 목록은 빈 문자열', formatBoothList([]) === '');
check('빈 배열이면 요약도 0', summarizeDuplicates([]).duplicateSellers === 0);

/* ================================================================ */
console.log('\n----------------------------------------------------');
console.log(`통과 ${pass}건 / 실패 ${fail}건`);
if (fail > 0) {
  console.log('\n❌ 실패 항목이 있습니다. zip 을 폴더 단위가 아니라 파일 단위로 다시 덮어써 주세요.');
  process.exit(1);
}
console.log('\n✅ 전부 통과했습니다.');
process.exit(0);
