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
const currentUser = rawUser ? JSON.parse(rawUser) : null;

if (!currentUser) {
  window.location.href = 'login.html';
}
const isHost = currentUser && Number(currentUser.userType) === 1;

/* ---------------------- 프로필 정보 렌더링 ---------------------- */
function renderProfile(profile) {
  const nickname = profile.nickname || '이름 미입력';
  const titleText = isHost ? `${nickname}님의 플리마켓` : `판매자 ${nickname}님`;

  const badgeEl = document.getElementById('profile-title-badge');
  if (badgeEl) badgeEl.textContent = titleText;

  const introEl = document.getElementById('profile-intro');
  if (introEl) introEl.textContent = profile.introText || '한 줄 소개를 등록해보세요.';

  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl && profile.profileImage) {
    avatarEl.innerHTML = `<img src="${API_BASE_URL}${profile.profileImage}" alt="프로필 사진" />`;
  }

  const bioTextEl = document.getElementById('profile-bio-text');
  if (bioTextEl) bioTextEl.textContent = profile.bioText || '등록된 소개글이 없어요.';

  const bioImageEl = document.getElementById('profile-bio-image');
  if (bioImageEl && profile.bioImage) {
    bioImageEl.innerHTML = `<img src="${API_BASE_URL}${profile.bioImage}" alt="소개 이미지" />`;
  }
}

/* ---------------------- 주최자: 행사현황 + 성공율 ---------------------- */
function renderHostStats(stats) {
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

function renderReviewBlock({ sectionId, scoreId, starsId, countId, listId, data, emptyText }) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.hidden = false;

  const avg = data.averageRating;
  document.getElementById(scoreId).textContent = avg !== null ? avg.toFixed(1) : '-';
  document.getElementById(starsId).textContent = avg !== null ? renderStars(avg) : '☆☆☆☆☆';
  document.getElementById(countId).textContent = `평가 ${data.reviewCount || 0}건`;

  const listEl = document.getElementById(listId);
  if (!data.reviews || data.reviews.length === 0) {
    listEl.innerHTML = `<li class="review-empty">${emptyText}</li>`;
    return;
  }
  listEl.innerHTML = data.reviews
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
    const res = await callApi('/users/me/stats');
    if (res && res.success && res.data) {
      isHost ? renderHostStats(res.data) : renderSellerStats(res.data);
    }
  } catch (err) {
    console.error('행사 현황 조회 오류:', err);
  }
}

async function loadReviewSummary() {
  try {
    if (isHost) {
      const res = await callApi('/reviews/me/summary');
      if (res && res.success && res.data) {
        renderReviewBlock({
          sectionId: 'review-section',
          scoreId: 'review-avg-score',
          starsId: 'review-avg-stars',
          countId: 'review-count-text',
          listId: 'review-list',
          data: res.data,
          emptyText: '아직 등록된 평가가 없어요.',
        });
      }
    } else {
      const res = await callApi('/reviews/me/seller-summary');
      if (res && res.success && res.data) {
        renderReviewBlock({
          sectionId: 'seller-review-section',
          scoreId: 'seller-review-avg-score',
          starsId: 'seller-review-avg-stars',
          countId: 'seller-review-count-text',
          listId: 'seller-review-list',
          data: res.data,
          emptyText: '아직 등록된 평가가 없어요.',
        });
      }
    }
  } catch (err) {
    console.error('평가 요약 조회 오류:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadStats();
  loadReviewSummary();
});