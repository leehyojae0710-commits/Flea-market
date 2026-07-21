// 마켓 상세 페이지 - 판매자/주최자 화면 분기 처리
// market.js(데이터 로딩/렌더링)와 분리된 파일로,
// 로그인한 사용자의 userType(0: 판매자, 1: 주최자)에 따라
// "부스 선택" 영역과 "신청자 목록(주최측 전용)" 영역의 노출 여부만 담당합니다.
//
// 화면 요구사항
// 1) 판매자로 로그인 -> 부스 정보 + 부스 선택창 + 댓글/문의 노출 (신청자 목록은 숨김)
// 2) 주최자로 로그인 -> 부스 정보 + 신청자 목록 + 댓글/문의 노출 (부스 선택창은 숨김)

function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem('loggedInUser');
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('로그인 사용자 정보 파싱 실패:', err);
    return null;
  }
}

function isHostUser(user) {
  // main.js와 동일한 규칙: 0 - 판매자, 1 - 주최자
  return user?.userType === 1;
}

function applyRoleBasedMarketView() {
  const boothSelectPanel = document.getElementById('booth-select-panel');
  const hostPanel = document.getElementById('host-panel');
  if (!boothSelectPanel || !hostPanel) return;

  const user = getCurrentUser();
  const host = isHostUser(user);

  boothSelectPanel.style.display = host ? 'none' : '';
  hostPanel.style.display = host ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', applyRoleBasedMarketView);
