// frontend/common/js/role-routing.js
// [C-01] 역할별 첫 화면 분기 + 주최자 전용 화면 접근 차단
// [C-02] 주최자 -> 판매자 모드 전환 (단방향)
//
// 역할 정책 (기능정의서 확정)
//   userType 1 = 주최자 : 주최자 화면 + 판매자 화면 모두 사용 가능 (모드 전환 허용)
//   userType 0 = 판매자 : 판매자 화면만 사용 가능 (주최자 화면 / 주최자 전환 모두 차단)
//
// 용어
//   계정 역할(accountRole) : users.userType 으로 정해지는 고정 값. 바뀌지 않습니다.
//   화면 모드(viewRole)    : 주최자 계정이 지금 어떤 화면을 보고 있는지. 전환 대상은 이 값뿐입니다.
//
// 사용법
//   <head> 안에 <script src="../../common/js/role-routing.js"></script>
//   (가드가 렌더링 전에 동작해야 해서 body 하단이 아니라 head 권장)
//
// 신규 파일이라 기존 팀원 파일과 충돌하지 않습니다.

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 설정값                                                              */
  /* ------------------------------------------------------------------ */

  // 로그인 직후 / 모드 전환 후 이동할 첫 화면
  // [변경] 주최자도 마이마켓이 아니라 메인 페이지로 진입합니다.
  //        내 마켓 관리는 헤더의 「내 마켓 관리」 링크로 이동합니다.
  var ROLE_HOME = {
    host: '/index.html',
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
  var VIEW_ROLE_KEY = 'viewRole';

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
  /* 계정 역할 / 화면 모드                                               */
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

  // 계정 역할: 'host' | 'seller' | 'guest' (userType 기준, 전환해도 바뀌지 않음)
  function getAccountRole(user) {
    var u = user === undefined ? getLoggedInUser() : user;
    if (!u) return 'guest';
    return Number(u.userType) === 1 ? 'host' : 'seller';
  }

  // 화면 모드: 주최자 계정만 'seller' 로 바뀔 수 있습니다.
  function getViewRole() {
    var account = getAccountRole();
    if (account !== 'host') return account; // 판매자 / 비로그인은 전환 불가
    return sessionStorage.getItem(VIEW_ROLE_KEY) === 'seller' ? 'seller' : 'host';
  }

  function setViewRole(role) {
    if (getAccountRole() !== 'host') return 'seller';
    var next = role === 'seller' ? 'seller' : 'host';
    sessionStorage.setItem(VIEW_ROLE_KEY, next);
    return next;
  }

  // 이전 이름 호환 (기존 코드가 getUserRole 을 쓰고 있으면 화면 모드를 돌려줍니다)
  function getUserRole(user) {
    if (user !== undefined) return getAccountRole(user);
    return getViewRole();
  }

  function isHost(user) {
    return getAccountRole(user) === 'host';
  }

  function isLoggedIn() {
    return !!getLoggedInUser();
  }

  /* ------------------------------------------------------------------ */
  /* 역할 전환                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * 주최자 계정의 화면 모드를 바꾸고, 해당 모드의 첫 화면으로 이동합니다.
   * 서버(PATCH /auth/toggle-role)에도 동기화를 시도하지만,
   * 실패해도 화면 전환은 그대로 진행합니다. (activeRole 은 표시용 값)
   */
  async function switchRole(nextRole) {
    if (getAccountRole() !== 'host') {
      alert('판매자 계정은 주최자로 전환할 수 없습니다.');
      return;
    }

    var target = nextRole === 'seller' ? 'seller' : 'host';
    if (getViewRole() === target) return;

    try {
      if (typeof callApi === 'function') {
        await callApi('/auth/toggle-role', { method: 'PATCH' });
      }
    } catch (err) {
      console.warn('역할 전환 서버 동기화 실패(화면 전환은 계속 진행):', err);
    }

    setViewRole(target);
    // 주최자/판매자 모드 모두 메인 페이지로 이동합니다.
    // (내 마켓 관리는 헤더의 「내 마켓 관리」 링크로 진입)
    window.location.href = getRoleHomePath(target);
  }

  function toggleRole() {
    return switchRole(getViewRole() === 'host' ? 'seller' : 'host');
  }

  /* ------------------------------------------------------------------ */
  /* 첫 화면 이동                                                        */
  /* ------------------------------------------------------------------ */

  function getRoleHomePath(role) {
    var r = role || getViewRole();
    return toUrl(ROLE_HOME[r] || ROLE_HOME.guest);
  }

  // 로그인 성공 직후 호출 → 화면 모드를 계정 역할로 초기화하고 첫 화면으로 이동
  function redirectToRoleHome(nextPath) {
    var account = getAccountRole();
    if (account === 'host') sessionStorage.setItem(VIEW_ROLE_KEY, 'host');
    else sessionStorage.removeItem(VIEW_ROLE_KEY);

    if (nextPath && isAllowedForRole(nextPath, account)) {
      window.location.replace(nextPath);
      return;
    }
    window.location.replace(getRoleHomePath(account));
  }

  function isHostOnlyPath(path) {
    var file = String(path).split('?')[0].split('#')[0].split('/').pop().toLowerCase();
    return HOST_ONLY_PAGES.indexOf(file) >= 0;
  }

  function isAllowedForRole(path, role) {
    if (!isHostOnlyPath(path)) return true;
    return (role || getAccountRole()) === 'host';
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
    if (getAccountRole() !== 'host') {
      alert(BLOCK_MESSAGE);
      window.location.replace(getRoleHomePath('seller'));
      return;
    }

    // 3) 주최자가 판매자 모드로 들어온 경우 → 주최자 모드로 자동 복귀
    if (getViewRole() !== 'host') setViewRole('host');
  }

  guardRolePage();

  /* ------------------------------------------------------------------ */
  /* 헤더 역할 전환 버튼 (주최자 계정에만 자동 삽입)                     */
  /* ------------------------------------------------------------------ */

  function injectSwitchButtonStyle() {
    if (document.getElementById('role-switch-style')) return;
    var style = document.createElement('style');
    style.id = 'role-switch-style';
    // [UI 개선] 색상을 currentColor/inherit 에 맡기지 않고 브랜드 팔레트를 직접 지정해
    // 어두운 헤더 배경(#241a13) 위에서도 항상 눈에 띄도록 함.
    // 현재 모드에 따라 mustard(주최자) / coral(판매자) 색을 달리 써서 상태도 함께 구분.
    style.textContent =
      '.role-switch-btn{display:inline-flex;align-items:center;padding:7px 16px 7px 6px;' +
      'border:1.5px solid var(--mustard,#e8a33d);border-radius:999px;' +
      'background:rgba(232,163,61,.16);color:var(--paper,#fbf6ec);' +
      'font-family:"Inter",sans-serif;font-size:13px;font-weight:600;line-height:1.2;' +
      'cursor:pointer;white-space:nowrap;' +
      'transition:background .15s ease,border-color .15s ease,transform .1s ease;}' +
      '.role-switch-btn:hover{background:var(--mustard,#e8a33d);color:var(--mustard-text,#3d2905);}' +
      '.role-switch-btn:active{transform:translateY(1px);}' +
      '.role-switch-btn:focus-visible{outline:2px solid var(--paper,#fbf6ec);outline-offset:2px;}' +
      '.role-switch-btn .role-switch-mode{opacity:.95;margin-right:8px;padding:3px 9px;' +
      'border-radius:999px;background:rgba(0,0,0,.28);font-weight:700;font-size:11px;}' +
      '.role-switch-btn.is-seller{border-color:var(--coral,#e07a3c);background:rgba(224,122,60,.16);}' +
      '.role-switch-btn.is-seller:hover{background:var(--coral,#e07a3c);color:var(--paper,#fbf6ec);}';
    document.head.appendChild(style);
  }

  function renderRoleSwitchButton() {
    if (getAccountRole() !== 'host') return;

    var header = document.querySelector('header.nav') || document.querySelector('header');
    if (!header) return;

    injectSwitchButtonStyle();

    var btn = document.getElementById('role-switch-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'role-switch-btn';
      btn.className = 'role-switch-btn';
      btn.addEventListener('click', function () { toggleRole(); });

      // index.html 처럼 nav-links 가 있으면 그 안에, 없으면 헤더 끝에 붙입니다.
      // (margin-left:auto 를 없애고 다른 nav-links 항목들과 동일한 gap 규칙을 따르도록 함
      //  → 브랜드 로고/마이페이지 링크 쪽이 몰려 붙어 보이던 문제도 함께 해소)
      var navLinks = header.querySelector('.nav-links');
      (navLinks || header).appendChild(btn);
    }

    var mode = getViewRole();
    btn.classList.toggle('is-seller', mode !== 'host');
    btn.innerHTML =
      '<span class="role-switch-mode">' + (mode === 'host' ? '주최자 모드' : '판매자 모드') + '</span>' +
      (mode === 'host' ? '판매자로 전환' : '주최자로 전환');
    btn.title = mode === 'host'
      ? '판매자 모드로 바꾸면 다른 마켓에 부스를 신청할 수 있어요.'
      : '주최자 모드로 돌아가 내 마켓을 관리합니다.';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderRoleSwitchButton);
  } else {
    renderRoleSwitchButton();
  }

  /* ------------------------------------------------------------------ */
  /* 외부 공개                                                           */
  /* ------------------------------------------------------------------ */

  window.RoleRouting = {
    ROLE_HOME: ROLE_HOME,
    HOST_ONLY_PAGES: HOST_ONLY_PAGES,
    getLoggedInUser: getLoggedInUser,
    getAccountRole: getAccountRole,
    getViewRole: getViewRole,
    setViewRole: setViewRole,
    getUserRole: getUserRole,
    isHost: isHost,
    isLoggedIn: isLoggedIn,
    switchRole: switchRole,
    toggleRole: toggleRole,
    getRoleHomePath: getRoleHomePath,
    redirectToRoleHome: redirectToRoleHome,
    isAllowedForRole: isAllowedForRole,
    guardRolePage: guardRolePage,
    renderRoleSwitchButton: renderRoleSwitchButton,
    toUrl: toUrl,
  };

  // 기존 스크립트에서 짧게 쓰기 위한 전역 별칭
  window.redirectToRoleHome = redirectToRoleHome;
})();
