// frontend/common/js/role-routing.js
// [C-01 신규] 역할별 첫 화면 분기 + 주최자 전용 화면 접근 차단
//
// 역할 정책 (기능정의서 확정)
//   userType 1 = 주최자 : 주최자 화면 + 판매자 화면 모두 사용 가능 (주최자 → 판매자 겸용 허용)
//   userType 0 = 판매자 : 판매자 화면만 사용 가능 (주최자 화면 접근 / 주최자 전환 모두 차단)
//
// 사용법
//   1) <head> 안에 <script src="/common/js/role-routing.js"></script> 를 넣습니다.
//      (가드가 렌더링 전에 동작해야 해서 body 하단이 아니라 head 권장)
//   2) 주최자 전용 페이지는 아래 HOST_ONLY_PAGES 배열에만 파일명을 추가하면 자동으로 막힙니다.
//
// 신규 파일이라 기존 팀원 파일과 충돌하지 않습니다.

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 설정값                                                              */
  /* ------------------------------------------------------------------ */

  // 역할별 첫 화면 (주최 = 내 마켓 관리 / 판매 = 마켓 탐색)
  var ROLE_HOME = {
    host: '/pages/B_host-seller/mymarketpage.html',
    seller: '/index.html',
    guest: '/index.html',
  };

  // 주최자만 들어갈 수 있는 화면 (파일명 소문자 기준)
  var HOST_ONLY_PAGES = [
    'mymarketpage.html',     // 내 마켓 관리
    'market-create.html',    // 마켓 등록
    'correctionmarket.html', // 마켓 수정
  ];

  var LOGIN_PAGE = '/pages/A_auth-main/login.html';

  var BLOCK_MESSAGE = '판매자 계정은 주최자 화면을 이용할 수 없습니다.\n주최자 기능이 필요하면 주최자 계정으로 가입해 주세요.';

  /* ------------------------------------------------------------------ */
  /* 경로 계산                                                           */
  /* ------------------------------------------------------------------ */

  // Live Server 루트가 프로젝트 하위 폴더인 경우도 있어서
  // 현재 URL에서 프론트 루트를 역산합니다. (예: /Flea-market/frontend)
  function getSiteRoot() {
    var path = window.location.pathname;
    var idx = path.toLowerCase().indexOf('/pages/');
    if (idx >= 0) return path.slice(0, idx);
    return path.replace(/\/[^/]*$/, '');
  }

  function toUrl(relPath) {
    return getSiteRoot() + relPath;
  }

  function currentFileName() {
    var parts = window.location.pathname.split('/');
    return (parts[parts.length - 1] || 'index.html').toLowerCase();
  }

  /* ------------------------------------------------------------------ */
  /* 역할 판정                                                           */
  /* ------------------------------------------------------------------ */

  function getLoggedInUser() {
    try {
      var raw = sessionStorage.getItem('loggedInUser');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error('로그인 사용자 정보 파싱 실패:', err);
      return null;
    }
  }

  // 'host' | 'seller' | 'guest'
  function getUserRole(user) {
    var u = user === undefined ? getLoggedInUser() : user;
    if (!u) return 'guest';
    return Number(u.userType) === 1 ? 'host' : 'seller';
  }

  function isHost(user) {
    return getUserRole(user) === 'host';
  }

  function isLoggedIn() {
    return !!getLoggedInUser();
  }

  /* ------------------------------------------------------------------ */
  /* 첫 화면 이동                                                        */
  /* ------------------------------------------------------------------ */

  function getRoleHomePath(role) {
    var r = role || getUserRole();
    return toUrl(ROLE_HOME[r] || ROLE_HOME.guest);
  }

  // 로그인 성공 직후 호출 → 역할별 첫 화면으로 이동
  // nextPath 가 있으면 그쪽을 우선하되, 역할상 못 들어가는 곳이면 무시합니다.
  function redirectToRoleHome(nextPath) {
    var role = getUserRole();

    if (nextPath && isAllowedForRole(nextPath, role)) {
      window.location.replace(nextPath);
      return;
    }
    window.location.replace(getRoleHomePath(role));
  }

  function isHostOnlyPath(path) {
    var file = String(path).split('?')[0].split('#')[0].split('/').pop().toLowerCase();
    return HOST_ONLY_PAGES.indexOf(file) >= 0;
  }

  function isAllowedForRole(path, role) {
    if (!isHostOnlyPath(path)) return true;
    return (role || getUserRole()) === 'host';
  }

  /* ------------------------------------------------------------------ */
  /* 페이지 접근 가드 (스크립트 로드 즉시 실행)                          */
  /* ------------------------------------------------------------------ */

  function guardRolePage() {
    if (!isHostOnlyPath(currentFileName())) return;

    // 1) 비로그인 → 로그인 화면으로 (로그인 후 원래 페이지로 복귀)
    if (!isLoggedIn()) {
      var next = window.location.pathname + window.location.search;
      window.location.replace(toUrl(LOGIN_PAGE) + '?next=' + encodeURIComponent(next));
      return;
    }

    // 2) 판매자 계정 → 주최자 화면 차단 후 판매자 첫 화면으로
    if (!isHost()) {
      alert(BLOCK_MESSAGE);
      window.location.replace(getRoleHomePath('seller'));
    }
  }

  guardRolePage();

  /* ------------------------------------------------------------------ */
  /* 외부 공개                                                           */
  /* ------------------------------------------------------------------ */

  window.RoleRouting = {
    ROLE_HOME: ROLE_HOME,
    HOST_ONLY_PAGES: HOST_ONLY_PAGES,
    getLoggedInUser: getLoggedInUser,
    getUserRole: getUserRole,
    isHost: isHost,
    isLoggedIn: isLoggedIn,
    getRoleHomePath: getRoleHomePath,
    redirectToRoleHome: redirectToRoleHome,
    isAllowedForRole: isAllowedForRole,
    guardRolePage: guardRolePage,
    toUrl: toUrl,
  };

  // 기존 스크립트에서 짧게 쓰기 위한 전역 별칭
  window.redirectToRoleHome = redirectToRoleHome;
})();
