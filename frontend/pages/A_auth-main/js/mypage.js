// A_auth-main/js/mypage.js — 마이페이지 "프로필 보기" 화면

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alert-box');
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.classList.remove('alert-error', 'alert-success');
  alertBox.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

/* ---------------------- 로그인 여부 확인 ---------------------- */
const rawUser = sessionStorage.getItem('loggedInUser');
let currentUser = rawUser ? JSON.parse(rawUser) : null;

if (!currentUser) {
  window.location.href = 'login.html';
}
// [수정] 예전에는 계정 종류(userType)만 보고 주최자 화면을 그렸습니다.
//        주최자 계정은 「판매자 모드」로 전환할 수 있으므로(role-routing.js), 마이페이지도
//        계정 종류가 아니라 지금의 화면 모드(viewRole)를 기준으로 나눠 보여줍니다.
//          accountIsHost : 계정 종류 (users.userType, 바뀌지 않음)
//          isHost        : 지금 보고 있는 화면 모드가 주최자인지
function getViewRoleSafe() {
  if (window.RoleRouting && typeof window.RoleRouting.getViewRole === 'function') {
    return window.RoleRouting.getViewRole();
  }
  // role-routing.js 가 아직 로드되지 않은 경우를 위한 폴백 (같은 판정 규칙)
  const account = currentUser && Number(currentUser.userType) === 1 ? 'host' : 'seller';
  if (account !== 'host') return 'seller';
  return sessionStorage.getItem('viewRole') === 'seller' ? 'seller' : 'host';
}

let accountIsHost = currentUser && Number(currentUser.userType) === 1;
let isHost = getViewRoleSafe() === 'host';

/* ---------------------- 프로필 정보 렌더링 ---------------------- */
function renderProfile(profile) {
  const nickname = profile.nickname || '이름 미입력';
  const titleText = isHost ? `${nickname}님의 플리마켓` : `판매자 ${nickname}님`;

  const badgeEl = document.getElementById('profile-title-badge');
  if (badgeEl) badgeEl.textContent = titleText;

  // [추가] 같은 계정이라도 지금 보는 프로필이 주최자용인지 판매자용인지 한눈에 보이게 표시합니다.
  const roleChipEl = document.getElementById('profile-role-chip');
  if (roleChipEl) {
    roleChipEl.textContent = isHost ? '주최자 프로필' : '판매자 프로필';
    roleChipEl.classList.toggle('is-seller', !isHost);
    // 주최자 계정이 판매자 모드로 보고 있는 경우를 툴팁으로 한 번 더 안내합니다.
    roleChipEl.title =
      accountIsHost && !isHost
        ? '주최자 계정에서 판매자 모드로 보는 중입니다. 헤더의 「주최자로 전환」을 누르면 주최자 프로필로 돌아갑니다.'
        : '';
    roleChipEl.hidden = false;
  }

  const introEl = document.getElementById('profile-intro');
  if (introEl) introEl.textContent = profile.introText || '한 줄 소개를 등록해보세요.';

  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl && profile.profileImage) {
    // [추가] 파일이 지워졌거나 경로가 깨진 경우, 깨진 이미지 대신 기본 자리표시가 남게 합니다.
    avatarEl.innerHTML = `<img src="${API_BASE_URL}${profile.profileImage}" alt="프로필 사진" onerror="this.remove()" />`;
  }

  const bioTextEl = document.getElementById('profile-bio-text');
  if (bioTextEl) bioTextEl.textContent = profile.bioText || '등록된 소개글이 없어요.';

  const bioImageEl = document.getElementById('profile-bio-image');
  if (bioImageEl && profile.bioImage) {
    bioImageEl.innerHTML = `<img src="${API_BASE_URL}${profile.bioImage}" alt="소개 이미지" onerror="this.remove()" />`;
  }
}

/* ---------------------- 주최자: 행사현황 + 성공율 ---------------------- */
function renderHostStats(stats) {
  // 판매자 모드에서는 호출되지 않지만, 혹시 모를 오호출을 막아둡니다.
  if (!isHost) return;
  document.getElementById('host-stats-block').hidden = false;
  document.getElementById('host-success-block').hidden = false;

  document.getElementById('stat-upcoming').textContent = stats.upcomingCount ?? 0;
  document.getElementById('stat-past').textContent = stats.pastCount ?? 0;
  document.getElementById('stat-cancelled').textContent = stats.cancelledCount ?? 0;

  const donut = document.getElementById('stat-donut');
  const rateEl = document.getElementById('stat-donut-rate');
  const upcoming = Number(stats.upcomingCount) || 0;
  const past = Number(stats.pastCount) || 0;
  const cancel = Number(stats.cancelledCount) || 0;
  const settled = past + cancel;

  const pendingEl = document.getElementById('rate-pending');
  if (pendingEl) pendingEl.textContent = upcoming > 0 ? `진행 중 ${upcoming}건은 집계 예정` : '';

  const successEl = document.getElementById('rate-success');
  const cancelEl = document.getElementById('rate-cancelled');

  if (settled === 0) {
    rateEl.textContent = '–';
    donut.style.background = 'conic-gradient(#e5ded2 0 100%)';
    if (successEl) successEl.textContent = '0 / 0';
    if (cancelEl) cancelEl.textContent = '0 / 0';
    return;
  }

  const successPct = (past / settled) * 100;
  donut.style.background = `conic-gradient(#2f6b8f 0 ${successPct}%, #cfc6b8 ${successPct}% 100%)`;
  rateEl.textContent = `${successPct.toFixed(1)}%`;
  if (successEl) successEl.textContent = `${past} / ${settled}`;
  if (cancelEl) cancelEl.textContent = `${cancel} / ${settled}`;
}

/* ---------------------- 주최자: 활동 현황 분포 도넛 ---------------------- */
// [추가] WBS 3.1.5.2 - 내가 등록한 마켓을 모집중/진행/종료/취소 4가지로 나눠
// 하나의 도넛(conic-gradient)에 이어 붙여 그립니다. 색은 아래 순서대로 시계방향입니다.
const ACTIVITY_SEGMENTS = [
  { key: 'recruitingCount', label: '모집중', color: '#2f6b8f', legendId: 'act-recruiting' },
  { key: 'ongoingCount', label: '진행', color: '#7fa9c4', legendId: 'act-ongoing' },
  { key: 'closedCount', label: '종료', color: '#cfc6b8', legendId: 'act-closed' },
  { key: 'cancelledCount', label: '취소', color: '#c98b7a', legendId: 'act-cancelled' },
];

function renderActivityDonut(data) {
  const block = document.getElementById('host-activity-block');
  const donut = document.getElementById('act-donut');
  if (!block || !donut) return;
  block.hidden = false;

  const counts = ACTIVITY_SEGMENTS.map((seg) => Number(data[seg.key]) || 0);
  const total = counts.reduce((sum, n) => sum + n, 0);

  const totalEl = document.getElementById('act-total');
  if (totalEl) totalEl.textContent = total;

  const noteEl = document.getElementById('act-note');

  // 마켓이 하나도 없을 때는 회색 빈 도넛으로 둡니다.
  if (total === 0) {
    ACTIVITY_SEGMENTS.forEach((seg) => {
      const el = document.getElementById(seg.legendId);
      if (el) el.textContent = '0건';
    });
    donut.style.background = 'conic-gradient(#e5ded2 0 100%)';
    donut.setAttribute('aria-label', '등록한 마켓이 없습니다.');
    if (noteEl) noteEl.textContent = '아직 등록한 마켓이 없어요.';
    return;
  }

  // 범례에는 건수와 비율을 함께 표시합니다.
  ACTIVITY_SEGMENTS.forEach((seg, i) => {
    const el = document.getElementById(seg.legendId);
    if (el) el.textContent = `${counts[i]}건 (${Math.round((counts[i] / total) * 100)}%)`;
  });

  // 0건인 구간은 stop을 만들지 않아야 경계선이 생기지 않습니다.
  let acc = 0;
  const stops = [];
  ACTIVITY_SEGMENTS.forEach((seg, i) => {
    if (counts[i] === 0) return;
    const start = (acc / total) * 100;
    acc += counts[i];
    const end = (acc / total) * 100;
    stops.push(`${seg.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
  });
  donut.style.background = `conic-gradient(${stops.join(', ')})`;

  // 도넛은 그림이라 스크린리더가 읽을 수 있게 수치를 넣어둡니다.
  donut.setAttribute(
    'aria-label',
    `전체 ${total}건 중 ` +
      ACTIVITY_SEGMENTS.map((seg, i) => `${seg.label} ${counts[i]}건`).join(', ')
  );
  if (noteEl) noteEl.textContent = `전체 ${total}건 기준`;
}

/* ---------------------- 판매자: 참여 이력 ---------------------- */
function renderSellerStats(stats) {
  document.getElementById('seller-stats-block').hidden = false;
  document.getElementById('stat-participated').textContent = stats.participatedCount ?? 0;
  document.getElementById('stat-review-count').textContent = stats.reviewCount ?? 0;
}

/* ---------------------- 공통: 별점 렌더 ---------------------- */
function renderStars(score) {
  const rounded = Math.round(Number(score) || 0);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

// ---------- 리뷰 목록 페이지네이션 (한 페이지에 5개씩, 이미 받아온 목록을 클라이언트에서 자름) ----------
const REVIEW_PAGE_SIZE = 5;
const reviewPageState = {}; // { [listId]: { page, reviews, emptyText } }

function renderReviewListPage(listId, paginationId) {
  const state = reviewPageState[listId];
  const listEl = document.getElementById(listId);
  if (!state || !listEl) return;

  const { reviews, emptyText } = state;

  if (!reviews || reviews.length === 0) {
    listEl.innerHTML = `<li class="review-empty">${emptyText}</li>`;
    renderReviewPagination(paginationId, listId, 0);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(reviews.length / REVIEW_PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;
  const start = (state.page - 1) * REVIEW_PAGE_SIZE;
  const pageItems = reviews.slice(start, start + REVIEW_PAGE_SIZE);

  listEl.innerHTML = pageItems
    .map(
      (r) => `
    <li class="review-item">
      <div class="review-item-top">
        <span class="review-item-stars">${renderStars(r.rating)}</span>
        <span class="review-item-market">${r.marketTitle}</span>
      </div>
      ${r.comment ? `<p class="review-item-comment">${r.comment}</p>` : ''}
    </li>`,
    )
    .join('');

  renderReviewPagination(paginationId, listId, totalPages);
}

// 현재 페이지 기준으로 보여줄 페이지 번호 목록을 만듦 (main.js와 동일한 축약 규칙)
function getReviewPageWindow(current, total) {
  const SIBLINGS = 2;
  const first = 1;
  const last = total;

  if (total <= SIBLINGS * 2 + 3) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const start = Math.max(current - SIBLINGS, first);
  const end = Math.min(current + SIBLINGS, last);
  const pages = [];

  pages.push(first);
  if (start > first + 1) pages.push('…');
  else if (start === first + 1) pages.push(first + 1);

  for (let p = start; p <= end; p++) {
    if (p !== first && p !== last) pages.push(p);
  }

  if (end < last - 1) pages.push('…');
  else if (end === last - 1) pages.push(last - 1);

  pages.push(last);

  return pages.filter((p, i) => p === '…' || pages.indexOf(p) === i);
}

function renderReviewPagination(paginationId, listId, totalPages) {
  const nav = document.getElementById(paginationId);
  if (!nav) return;
  if (totalPages <= 1) { nav.innerHTML = ''; return; }

  const currentPage = reviewPageState[listId]?.page || 1;
  const buttons = [];
  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`
  );

  getReviewPageWindow(currentPage, totalPages).forEach((p) => {
    if (p === '…') {
      buttons.push(`<span class="page-ellipsis">…</span>`);
    } else {
      buttons.push(
        `<button type="button" class="page-btn${p === currentPage ? ' is-active' : ''}" data-page="${p}">${p}</button>`
      );
    }
  });

  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`
  );
  nav.innerHTML = buttons.join('');

  // 매번 새로 렌더링되므로 리스너도 다시 붙임 (중복 방지를 위해 한 번만 등록되도록 dataset 플래그 사용)
  if (!nav.dataset.boundClick) {
    nav.dataset.boundClick = '1';
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.page-btn');
      if (!btn || btn.disabled) return;
      const page = Number(btn.dataset.page);
      const state = reviewPageState[listId];
      if (!page || !state || page === state.page) return;
      state.page = page;
      renderReviewListPage(listId, paginationId);
      document.getElementById(listId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function renderReviewBlock({ sectionId, scoreId, starsId, countId, listId, paginationId, data, emptyText }) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.hidden = false;

  const avg = data.averageRating;
  document.getElementById(scoreId).textContent = avg !== null ? avg.toFixed(1) : '-';
  document.getElementById(starsId).textContent = avg !== null ? renderStars(avg) : '☆☆☆☆☆';
  document.getElementById(countId).textContent = `평가 ${data.reviewCount || 0}건`;

  reviewPageState[listId] = { page: 1, reviews: data.reviews || [], emptyText };
  renderReviewListPage(listId, paginationId);
}

/* ---------------------- 초기 로드 ---------------------- */
async function loadProfile() {
  try {
    const res = await callApi('/users/me/profile');
    if (res && res.success && res.data) {
      renderProfile(res.data);
    } else {
      showAlert(res?.message || '프로필을 불러오지 못했어요.');
    }
  } catch (err) {
    console.error('프로필 조회 오류:', err);
    showAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

async function loadStats() {
  try {
    // [수정] 화면 모드를 서버에 알려서, 주최자 계정이 판매자 모드일 때는 참여 이력을 받습니다.
    const res = await callApi(`/users/me/stats?role=${isHost ? 'host' : 'seller'}`);
    if (res && res.success && res.data) {
      isHost ? renderHostStats(res.data) : renderSellerStats(res.data);
    }
  } catch (err) {
    console.error('행사 현황 조회 오류:', err);
  }
}

async function loadActivity() {
  // 주최한 마켓의 분포이므로 주최자 계정에서만 호출합니다.
  if (!isHost) return;
  try {
    const res = await callApi('/users/me/activity');
    if (res && res.success && res.data) {
      renderActivityDonut(res.data);
    }
  } catch (err) {
    console.error('활동 현황 분포 조회 오류:', err);
  }
}

async function loadReviewSummary() {
  // [삭제] 판매자 화면의 "주최자 평가"는 기능이 취소되어 더 이상 호출하지 않습니다.
  if (!isHost) return;
  try {
    const res = await callApi('/reviews/me/summary');
    if (res && res.success && res.data) {
      renderReviewBlock({
        sectionId: 'review-section',
        scoreId: 'review-avg-score',
        starsId: 'review-avg-stars',
        countId: 'review-count-text',
        listId: 'review-list',
        paginationId: 'review-pagination',
        data: res.data,
        emptyText: '아직 등록된 평가가 없어요.',
      });
    }
  } catch (err) {
    console.error('평가 요약 조회 오류:', err);
  }
}

/* ---------------------- 최신 서버 정보로 세션 동기화 ---------------------- */
// [수정] sessionStorage 스냅샷(로그인 시점 값)만 믿지 않고, GET /auth/me 로 최신 정보를
// 다시 받아와서 currentUser/isHost를 갱신합니다. (ensureSession()은 common/js/api.js 참고)
async function syncCurrentUser() {
  try {
    const freshUser = await ensureSession();
    if (freshUser) {
      currentUser = freshUser;
      accountIsHost = Number(currentUser.userType) === 1;
      // 계정 종류가 갱신됐으니 화면 모드도 다시 계산합니다.
      isHost = getViewRoleSafe() === 'host';
    }
  } catch (err) {
    console.error('세션 동기화 오류:', err);
    // 실패해도 화면은 기존 sessionStorage 값으로 계속 보여줍니다.
  }
}
// [UI 통일] 마이페이지 상단 3개 탭(내 프로필 / 내 정보수정 / 결제내역 확인)의
// active 표시를 한 곳에서 관리합니다. 버튼에는 data-tab="profile|edit|payment" 를 붙여둡니다.
function setActiveMypageTab(name) {
  document.querySelectorAll('.mypage-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
}

async function changePageProfile() {
  const page = document.getElementById('profile-panel');
  const paymentUi = document.getElementById('payment-list');
  const editUi = document.getElementById('edit-panel');
  if (!page)
    return;
  if (!paymentUi)
    return;
  setActiveMypageTab('profile');
  page.hidden = false;
  paymentUi.hidden = true;
  if (editUi) editUi.hidden = true;
  await syncCurrentUser();
  loadProfile();
  loadStats();
  loadActivity();
  loadReviewSummary();
}

// [UI 통일] '내 정보수정'을 누르면 profile-edit.html로 이동하는 대신, 같은 화면 안에서
// edit-panel(프로필 설정/소개 관리/내 정보 수정 3개 하위 탭)만 보여주도록 전환합니다.
function changePageEdit() {
  const page = document.getElementById('profile-panel');
  const paymentUi = document.getElementById('payment-list');
  const editUi = document.getElementById('edit-panel');
  if (!editUi) return;
  setActiveMypageTab('edit');
  if (page) page.hidden = true;
  if (paymentUi) paymentUi.hidden = true;
  editUi.hidden = false;
}

document.addEventListener('DOMContentLoaded', async () => {
  await syncCurrentUser();
  loadProfile();
  loadStats();
  loadActivity();
  loadReviewSummary();
});