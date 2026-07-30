// frontend/common/js/profile-link.js
// [신규] 닉네임을 눌러 상대방 프로필(user-profile.html)로 이동하는 공통 헬퍼.
//
// 왜 <a> 가 아니라 <span> 인가
//   메인 화면의 마켓 카드는 카드 전체가 이미 <a> 로 감싸여 있습니다.
//   그 안에 <a> 를 또 넣으면 잘못된 HTML 이라 브라우저가 태그를 끊어버립니다.
//   그래서 링크처럼 보이는 <span data-profile-user-id> 를 쓰고,
//   document 에 붙인 클릭 핸들러가 대신 이동시킵니다. (카드 링크로 전파되지 않게 막습니다)
//
// 사용법
//   <script src="../../common/js/profile-link.js"></script>
//   `주최자 ${ProfileLink.html(market.hostId, market.hostNickname)}`

(function () {
  'use strict';
  // api.js 에 같은 기능이 들어갔습니다. 이미 정의돼 있으면 아무것도 하지 않습니다.
  if (window.ProfileLink) return;

  var PROFILE_PAGE = '/pages/A_auth-main/user-profile.html';

  // role-routing.js 와 같은 방식으로 프론트 루트를 역산합니다.
  // (Live Server 루트가 프로젝트 하위 폴더인 경우도 있어서 고정 경로를 쓸 수 없습니다.)
  function getSiteRoot() {
    var path = window.location.pathname;
    var idx = path.toLowerCase().indexOf('/pages/');
    if (idx >= 0) return path.slice(0, idx);
    return path.replace(/\/[^/]*$/, '');
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function profileUrl(userId) {
    return getSiteRoot() + PROFILE_PAGE + '?userId=' + encodeURIComponent(userId);
  }

  /**
   * 닉네임 링크 HTML 을 만듭니다.
   * userId 가 없으면 링크 없이 텍스트만 돌려줍니다.
   *
   * @param {number|string} userId
   * @param {string} nickname
   * @param {{ fallback?: string }} [options] 닉네임이 없을 때 보여줄 문구
   */
  function profileLinkHtml(userId, nickname, options) {
    var opts = options || {};
    var label = nickname || opts.fallback || (userId ? '#' + userId : '알 수 없음');

    if (!userId) return escapeHtml(label);

    return (
      '<span class="profile-link" role="link" tabindex="0" ' +
      'data-profile-user-id="' + escapeHtml(userId) + '" ' +
      'title="' + escapeHtml(label) + '님의 프로필 보기">' +
      escapeHtml(label) +
      '</span>'
    );
  }

  function go(userId) {
    if (!userId) return;
    window.location.href = profileUrl(userId);
  }

  // 화면 어디에 렌더되든 동작하도록 document 한 곳에서만 처리합니다.
  function bindDelegatedHandlers() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-profile-user-id]') : null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation(); // 카드 전체 링크로 클릭이 새어나가지 않게 막습니다.
      go(el.getAttribute('data-profile-user-id'));
    });

    // 키보드 접근성 (Enter / Space)
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.closest ? e.target.closest('[data-profile-user-id]') : null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      go(el.getAttribute('data-profile-user-id'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDelegatedHandlers);
  } else {
    bindDelegatedHandlers();
  }

  window.ProfileLink = {
    url: profileUrl,
    html: profileLinkHtml,
    escapeHtml: escapeHtml,
  };
})();
