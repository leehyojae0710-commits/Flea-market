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
// [JWT activeRole 보완 - A안] 이번 변경분
//   1) getViewRole() 이 서버가 내려준 loggedInUser.activeRole 을 인정합니다.
//      (기존에는 sessionStorage.viewRole 만 봐서, 서버/DB/토큰과 어긋나도 알 수 없었습니다.)
//   2) redirectToRoleHome() 이 로그인 시 무조건 'host' 로 덮어쓰지 않고 서버 값으로 초기화합니다.
//   3) switchRole() 이 서버 응답을 신뢰합니다. 서버 전환이 실패하면 화면도 바꾸지 않습니다.
//      (기존에는 실패해도 화면만 바꿔서, 토큰은 주최자인데 화면은 판매자인 상태가 만들어졌습니다.)
//      전환 API 는 새 액세스 토큰을 함께 내려주고, api.js 가 자동으로 저장합니다.
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
  //
  // [JWT activeRole] 판정 순서
  //   1) sessionStorage.viewRole  - 이 탭에서 방금 전환한 값 (로그인 시 서버 값으로 초기화됨)
  //   2) loggedInUser.activeRole  - 서버(= 토큰에 서명된 값)가 내려준 값
  //   3) 계정 종류
  // 1번이 캐시일 뿐이고 진짜 기준은 2번이라는 점이 중요합니다.
  // 서버가 토큰에 같은 값을 서명하므로, 화면과 서버 판단이 어긋나지 않습니다.
  function getViewRole() {
    var account = getAccountRole();
    if (account !== 'host') return account; // 판매자 / 비로그인은 전환 불가

    var cached = sessionStorage.getItem(VIEW_ROLE_KEY);
    if (cached === 'host' || cached === 'seller') return cached;

    var user = getLoggedInUser();
    return user && user.activeRole === 'seller' ? 'seller' : 'host';
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
   *
   * [JWT activeRole] 서버가 기준입니다.
   *   PATCH /auth/toggle-role 이 DB 를 바꾸고 "새 역할이 서명된 액세스 토큰"을 함께 내려줍니다.
   *   (api.js 의 SESSION_ISSUING_PATHS 에 등록돼 있어 토큰/사용자정보는 자동 저장됩니다.)
   *
   *   예전에는 서버 호출이 실패해도 화면만 바꿨는데, 그러면
   *   "토큰은 주최자 / 화면은 판매자" 상태가 되어 마이페이지 통계나 가드가 어긋납니다.
   *   그래서 실패 시에는 전환을 취소합니다.
   */
  async function switchRole(nextRole) {
    if (getAccountRole() !== 'host') {
      alert('판매자 계정은 주최자로 전환할 수 없습니다.');
      return;
    }

    var target = nextRole === 'seller' ? 'seller' : 'host';
    if (getViewRole() === target) return;

    if (typeof callApi !== 'function') {
      alert('역할 전환을 처리할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      return;
    }

    var result = null;
    try {
      // 목표 역할을 명시해서 보냅니다. (단순 토글이면 DB 값이 어긋나 있을 때 반대로 뒤집힙니다)
      result = await callApi('/auth/toggle-role', {
        method: 'PATCH',
        body: { activeRole: target },
      });
    } catch (err) {
      console.error('역할 전환 요청 실패:', err);
    }

    if (!result || !result.success) {
      alert('역할 전환에 실패했습니다.\n' + ((result && result.message) || '잠시 후 다시 시도해 주세요.'));
      return;
    }

    // 서버가 실제로 적용한 값을 따릅니다. (요청한 값과 다를 수 있음)
    var applied = (result.data && result.data.activeRole) === 'seller' ? 'seller' : 'host';

    // users.activeRole 컬럼이 없는 DB 는 축소 모드로 동작합니다.
    // 전환 자체는 되지만 다시 로그인하면 기본 역할로 돌아가므로 콘솔에만 알려 둡니다.
    if (result.data && result.data.persisted === false) {
      console.warn('[역할 전환] 이번 로그인 동안만 유지됩니다. ' + (result.message || ''));
    }
    setViewRole(applied);

    // 주최자/판매자 모드 모두 메인 페이지로 이동합니다.
    // (내 마켓 관리는 헤더의 「내 마켓 관리」 링크로 진입)
    window.location.href = getRoleHomePath(applied);
  }

  /**
   * [JWT activeRole] 화면 이동 없이 서버의 activeRole 만 맞춥니다.
   *
   * 주최자가 판매자 모드인 채로 주최자 전용 화면에 들어오면 화면 모드를 host 로 되돌리는데,
   * 그때 서버(=토큰)도 같이 바꿔주지 않으면 "토큰은 seller / 화면은 host" 로 어긋납니다.
   * role-routing.js 는 <head> 에서 실행되므로 callApi 가 아직 없을 수 있어 DOM 준비 후로 미룹니다.
   */
  function syncViewRoleToServer(target) {
    var run = function () {
      if (typeof callApi !== 'function') return;
      callApi('/auth/toggle-role', { method: 'PATCH', body: { activeRole: target } })
        .then(function (res) {
          if (res && res.success && res.data) {
            setViewRole(res.data.activeRole === 'seller' ? 'seller' : 'host');
          }
        })
        .catch(function (err) {
          console.warn('역할 동기화 실패(화면은 그대로 유지):', err);
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
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

  // 로그인 성공 직후 호출 → 화면 모드를 서버 값으로 초기화하고 첫 화면으로 이동
  //
  // [JWT activeRole] 기존에는 주최자면 무조건 'host' 로 덮어썼습니다.
  //   그래서 DB 의 activeRole 이 무엇이든 화면은 항상 주최자 모드였고,
  //   users.activeRole 은 아무도 읽지 않는 죽은 값이 되어 있었습니다.
  //   이제 서버가 내려준 값(= 토큰에 서명된 값)으로 맞춥니다.
  function redirectToRoleHome(nextPath) {
    var account = getAccountRole();
    if (account === 'host') {
      var user = getLoggedInUser();
      sessionStorage.setItem(VIEW_ROLE_KEY, user && user.activeRole === 'seller' ? 'seller' : 'host');
    } else {
      sessionStorage.removeItem(VIEW_ROLE_KEY);
    }

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
    //    [JWT activeRole] 화면만 되돌리면 토큰과 어긋나므로 서버 값도 함께 맞춥니다.
    if (getViewRole() !== 'host') {
      setViewRole('host');
      syncViewRoleToServer('host');
    }
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
    syncViewRoleToServer: syncViewRoleToServer,
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
