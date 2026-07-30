// frontend/common/js/global-nav.js
// [공통] 상단 고정 네비게이션 바
//
// 하는 일
//   1) 화면마다 제각각이던 <header class="nav"> 를 하나의 표준 메뉴로 통일합니다.
//   2) 헤더가 아예 없는 화면(로그인/회원가입 등)에는 헤더를 만들어 넣습니다.
//   3) 로그인 상태 · 화면 모드(주최자/판매자)에 맞춰 메뉴 노출을 맞춥니다.
//   4) 고정 바 높이를 재서 --gnav-h 에 넣어 본문이 가려지지 않게 합니다.
//
// 사용법
//   <head> 안에서 global-nav.css 와 함께 defer 로 불러옵니다.
//     <link rel="stylesheet" href="../../common/css/global-nav.css" />
//     <script src="../../common/js/global-nav.js" defer></script>
//
//   특정 화면에서 끄고 싶으면 <body data-gnav="off"> 를 주면 됩니다.
//
// 충돌 방지 메모
//   - index.html 처럼 이미 nav-* 메뉴가 있는 화면은 메뉴를 다시 만들지 않고
//     위치/스타일만 고정으로 바꿉니다. (main.js 가 붙여 둔 이벤트가 그대로 살아 있음)
//   - defer 라 api.js / role-routing.js 의 DOMContentLoaded 처리보다 먼저 실행됩니다.
//     그래서 api.js 는 #nav-logout-btn 을 이미 있는 것으로 보고 중복 버튼을 만들지 않고,
//     role-routing.js 는 완성된 .nav-links 안에 역할 전환 버튼을 넣습니다.

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 경로 계산 (role-routing.js 와 동일 규칙)                            */
  /* ------------------------------------------------------------------ */

  function getSiteRoot() {
    var path = window.location.pathname;
    var idx = path.toLowerCase().indexOf('/pages/');
    if (idx >= 0) return path.slice(0, idx);
    return path.replace(/\/[^/]*$/, '');
  }

  function u(rel) {
    return getSiteRoot() + rel;
  }

  function currentFile() {
    var parts = window.location.pathname.split('/');
    return (parts[parts.length - 1] || 'index.html').toLowerCase();
  }

  var P = {
    home: '/index.html',
    login: '/pages/A_auth-main/login.html',
    register: '/pages/A_auth-main/register.html',
    mypage: '/pages/A_auth-main/mypage.html',
    marketCreate: '/pages/B_host-seller/market-create.html',
    myMarket: '/pages/B_host-seller/mymarketpage.html',
    myBooth: '/pages/B_host-seller/mybooth.html',
  };

  /* ------------------------------------------------------------------ */
  /* 로그인 상태 / 화면 모드                                             */
  /* ------------------------------------------------------------------ */

  function getUser() {
    try {
      var raw = sessionStorage.getItem('loggedInUser');
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function isHostAccount(user) {
    return !!user && Number(user.userType) === 1;
  }

  // 주최자 계정은 판매자 모드로 전환할 수 있으므로 viewRole 기준으로 노출합니다.
  function getViewRole(user) {
    if (window.RoleRouting && typeof window.RoleRouting.getViewRole === 'function') {
      return window.RoleRouting.getViewRole();
    }
    return isHostAccount(user) ? 'host' : 'seller';
  }

  /* ------------------------------------------------------------------ */
  /* 메뉴 마크업 (index.html 과 동일한 id 를 씁니다)                     */
  /* ------------------------------------------------------------------ */

  function navMarkup() {
    return (
      '<a href="' + u(P.login) + '" id="nav-login-link" class="link-ghost">로그인</a>' +
      '<a href="' + u(P.register) + '" id="nav-register-link" class="link-ghost">회원가입</a>' +
      '<a href="' + u(P.mypage) + '" id="nav-mypage-link" class="link-ghost" hidden>마이페이지</a>' +
      '<button type="button" id="nav-logout-btn" class="btn-logout" hidden>로그아웃</button>' +
      '<button type="button" id="host-cta" class="btn btn-mustard" hidden>마켓 등록하기</button>' +
      '<button type="button" id="nav-hostmarket-link" class="btn btn-mustard" hidden>내 마켓 관리</button>' +
      '<button type="button" id="nav-sellerbooth-link" class="btn btn-mustard" hidden>내 부스 관리</button>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 헤더 만들기 / 정리하기                                              */
  /* ------------------------------------------------------------------ */

  function buildHeader() {
    var header = document.querySelector('header.nav') || document.querySelector('body > header');

    if (!header) {
      header = document.createElement('header');
      header.className = 'nav';
      document.body.insertBefore(header, document.body.firstChild);
    }
    header.classList.add('gnav');

    // 1) 브랜드 로고 (없으면 생성, 있으면 홈 링크만 보정)
    var brand = header.querySelector('.brand');
    if (!brand) {
      brand = document.createElement('a');
      brand.className = 'brand';
      brand.innerHTML = '<span class="pin-dot" aria-hidden="true"></span>플리마켓';
      header.insertBefore(brand, header.firstChild);
    }
    if (brand.tagName === 'A') brand.setAttribute('href', u(P.home));

    // 2) 링크 묶음 확보
    var links = header.querySelector('.nav-links');
    if (!links) {
      links = document.createElement('nav');
      links.className = 'nav-links';
      header.appendChild(links);
    }

    // 3) 화면마다 따로 박혀 있던 「마이페이지」 링크는 표준 메뉴와 겹치므로 제거
    var ghosts = header.querySelectorAll('a.link-ghost');
    for (var i = 0; i < ghosts.length; i++) {
      var a = ghosts[i];
      if (a.id) continue; // index.html 의 nav-* 링크는 그대로 둡니다.
      if (/mypage\.html/i.test(a.getAttribute('href') || '')) a.parentNode.removeChild(a);
    }

    // 4) 표준 메뉴가 없는 화면에만 새로 만들어 넣고, 이벤트도 여기서 붙입니다.
    if (!document.getElementById('nav-login-link')) {
      links.insertAdjacentHTML('beforeend', navMarkup());
      bindHandlers();
    }

    // 5) 역할 전환 버튼은 항상 메뉴 맨 끝으로
    var switchBtn = header.querySelector('#role-switch-btn');
    if (switchBtn && switchBtn.parentNode !== links) {
      links.appendChild(switchBtn);
    } else if (!switchBtn && window.RoleRouting && window.RoleRouting.renderRoleSwitchButton) {
      window.RoleRouting.renderRoleSwitchButton();
      switchBtn = header.querySelector('#role-switch-btn');
      if (switchBtn && switchBtn.parentNode !== links) links.appendChild(switchBtn);
    }

    // 6) 가운데 정렬용 래퍼로 감싸기 (한 번만)
    if (!header.querySelector('.gnav-inner')) {
      var inner = document.createElement('div');
      inner.className = 'gnav-inner';
      while (header.firstChild) inner.appendChild(header.firstChild);
      header.appendChild(inner);
    }

    document.body.classList.add('gnav-ready');
    return header;
  }

  /* ------------------------------------------------------------------ */
  /* 이벤트 (이 스크립트가 직접 만든 버튼에만 붙습니다)                  */
  /* ------------------------------------------------------------------ */

  function goOrLogin(path) {
    window.location.href = getUser() ? u(path) : u(P.login);
  }

  function bindHandlers() {
    var cta = document.getElementById('host-cta');
    if (cta) cta.addEventListener('click', function () { goOrLogin(P.marketCreate); });

    var host = document.getElementById('nav-hostmarket-link');
    if (host) host.addEventListener('click', function () { goOrLogin(P.myMarket); });

    var booth = document.getElementById('nav-sellerbooth-link');
    if (booth) booth.addEventListener('click', function () { goOrLogin(P.myBooth); });

    var out = document.getElementById('nav-logout-btn');
    if (out) {
      out.addEventListener('click', async function () {
        try {
          if (typeof logoutUser === 'function') await logoutUser();
        } catch (err) {
          console.warn('로그아웃 요청 실패(로컬 세션은 정리합니다):', err);
        }
        sessionStorage.removeItem('loggedInUser');
        sessionStorage.removeItem('viewRole');
        window.location.href = u(P.home);
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* 노출 상태 맞추기                                                    */
  /* ------------------------------------------------------------------ */

  function setHidden(id, hidden) {
    var el = document.getElementById(id);
    if (el) el.hidden = !!hidden;
  }

  function syncNav() {
    var user = getUser();
    var loggedIn = !!user;
    var view = getViewRole(user);

    var showHost = loggedIn && isHostAccount(user) && view === 'host';
    var showSeller = loggedIn && view === 'seller';

    setHidden('nav-login-link', loggedIn);
    setHidden('nav-register-link', loggedIn);
    setHidden('nav-mypage-link', !loggedIn);
    setHidden('nav-logout-btn', !loggedIn);
    setHidden('host-cta', !showHost);
    setHidden('nav-hostmarket-link', !showHost);
    setHidden('nav-sellerbooth-link', !showSeller);
  }

  // 지금 보고 있는 화면에 해당하는 메뉴에 표시를 남깁니다.
  function markActive() {
    var file = currentFile();
    var map = {
      'mypage.html': 'nav-mypage-link',
      'profile-edit.html': 'nav-mypage-link',
      'mymarketpage.html': 'nav-hostmarket-link',
      'mybooth.html': 'nav-sellerbooth-link',
      'market-create.html': 'host-cta',
    };
    var id = map[file];
    if (!id) return;
    var el = document.getElementById(id);
    if (el) el.classList.add('is-active');
  }

  /* ------------------------------------------------------------------ */
  /* 고정 바 높이 반영 (줄바꿈되면 높이가 달라지므로 계속 갱신)          */
  /* ------------------------------------------------------------------ */

  function syncHeight(header) {
    var h = header.offsetHeight || 64;
    document.documentElement.style.setProperty('--gnav-h', h + 'px');
  }

  function watchHeight(header) {
    var apply = function () { syncHeight(header); };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('load', apply);
    if (window.ResizeObserver) new ResizeObserver(apply).observe(header);
  }

  /* ------------------------------------------------------------------ */
  /* 실행                                                                */
  /* ------------------------------------------------------------------ */

  function init() {
    if (!document.body) return;
    if (document.body.getAttribute('data-gnav') === 'off') return;

    var header = buildHeader();
    syncNav();
    markActive();
    watchHeight(header);

    // 다른 스크립트(main.js 등)가 로그인 상태를 바꾼 뒤에도 맞도록 한 번 더
    document.addEventListener('DOMContentLoaded', syncNav);
    window.addEventListener('pageshow', syncNav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.GlobalNav = {
    sync: syncNav,
    rebuild: buildHeader,
    toUrl: u,
  };
})();
