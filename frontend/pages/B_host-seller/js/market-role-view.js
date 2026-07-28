// 마켓 상세 페이지 - 판매자/주최자 화면 분기 처리
// market.js(데이터 로딩/렌더링)와 분리된 파일입니다.
//
// [C-02 반영] 판정 기준이 "계정 역할(userType)"에서 "현재 화면 모드 + 내 마켓 여부"로 바뀌었습니다.
//
// 화면 요구사항
// 1) 내가 주최한 마켓        -> 신청자 목록 노출, 부스 선택창 숨김 (자기신청 차단)
// 2) 남의 마켓 + 판매자 모드 -> 부스 선택창 노출, 신청자 목록 숨김
// 3) 남의 마켓 + 주최자 모드 -> 둘 다 숨기고 "판매자 모드로 전환" 안내 노출
//    (주최자도 판매자가 될 수 있으므로, 전환만 하면 바로 신청할 수 있습니다)
// 4) 비로그인               -> 부스 선택창 노출 (신청 시 로그인 유도는 기존 로직 그대로)

function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem('loggedInUser');
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('로그인 사용자 정보 파싱 실패:', err);
    return null;
  }
}

function getCurrentViewRole() {
  if (window.RoleRouting) return window.RoleRouting.getViewRole();
  // role-routing.js 미로드 시 기존 규칙(0 - 판매자, 1 - 주최자)으로 동작
  const user = getCurrentUser();
  if (!user) return 'guest';
  return Number(user.userType) === 1 ? 'host' : 'seller';
}

function isMyMarket(market) {
  const user = getCurrentUser();
  if (!user || !market || market.hostId === undefined || market.hostId === null) return false;
  return Number(market.hostId) === Number(user.userId);
}

/** 남의 마켓을 주최자 모드로 보고 있을 때 띄우는 전환 안내 */
function renderSwitchNotice(show) {
  const anchor = document.getElementById('booth-select-panel');
  if (!anchor) return;

  let notice = document.getElementById('role-switch-notice');

  if (!show) {
    if (notice) notice.hidden = true;
    return;
  }

  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'role-switch-notice';
    notice.style.cssText =
      'padding:14px 16px;border:1px dashed currentColor;border-radius:12px;opacity:.85;font-size:14px;';
    notice.innerHTML =
      '<p style="margin:0 0 10px;">지금은 <strong>주최자 모드</strong>입니다. 부스를 신청하려면 판매자 모드로 전환해 주세요.</p>' +
      '<button type="button" id="notice-switch-btn" class="btn btn-primary">판매자로 전환</button>';
    anchor.parentNode.insertBefore(notice, anchor.nextSibling);

    notice.querySelector('#notice-switch-btn')?.addEventListener('click', () => {
      if (window.RoleRouting) window.RoleRouting.switchRole('seller');
    });
  }

  notice.hidden = false;
}

function applyRoleBasedMarketView(market) {
  const boothSelectPanel = document.getElementById('booth-select-panel');
  const hostPanel = document.getElementById('host-panel');
  if (!boothSelectPanel || !hostPanel) return;

  const mine = isMyMarket(market);
  const viewRole = getCurrentViewRole();

  // 내 마켓이면 모드와 상관없이 주최자 화면
  const showHostPanel = mine;
  // 남의 마켓이고 주최자 모드가 아닐 때만 신청 가능
  const showBoothSelect = !mine && viewRole !== 'host';

  hostPanel.style.display = showHostPanel ? '' : 'none';
  boothSelectPanel.style.display = showBoothSelect ? '' : 'none';

  renderSwitchNotice(!mine && viewRole === 'host');
}

// market.js 가 상세 데이터를 그릴 때 hostId 를 넘겨받아 다시 판정합니다.
// (renderMarketDetail 은 market-detail-extra.js 와 동일한 래핑 방식입니다)
(function hookRenderMarketDetail() {
  const original = window.renderMarketDetail;
  if (typeof original !== 'function') return;

  window.renderMarketDetail = function renderMarketDetailWithRoleView(market) {
    const result = original.apply(this, arguments);
    applyRoleBasedMarketView(market);
    return result;
  };
})();

// 상세 데이터가 오기 전 첫 렌더 (market 정보 없이 모드만으로 1차 판정)
document.addEventListener('DOMContentLoaded', () => applyRoleBasedMarketView(null));
