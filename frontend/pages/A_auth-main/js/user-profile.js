// A_auth-main/js/user-profile.js — 다른 사람 프로필 열람 (읽기 전용)
//
// 진입 방법: user-profile.html?userId=12
//   - 마켓 상세의 주최자 이름, 신청자 목록의 판매자 이름 등에서 이 주소로 링크를 걸면 됩니다.
//   - 로그인하지 않아도 볼 수 있습니다. (공개 API: GET /api/profiles/:userId)

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alert-box');
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.classList.remove('alert-error', 'alert-success');
  alertBox.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

// 사용자 입력/DB 값이 그대로 innerHTML 에 들어가지 않도록 항상 이스케이프합니다.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTargetUserId() {
  const raw = new URLSearchParams(window.location.search).get('userId');
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function renderStars(score) {
  const rounded = Math.round(Number(score) || 0);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

function renderProfile(profile) {
  const isHost = profile.role === 'host';
  const nickname = profile.nickname || '이름 미입력';

  const badgeEl = document.getElementById('profile-title-badge');
  if (badgeEl) badgeEl.textContent = isHost ? `${nickname}님의 플리마켓` : `판매자 ${nickname}님`;

  const roleChipEl = document.getElementById('profile-role-chip');
  if (roleChipEl) {
    roleChipEl.textContent = isHost ? '주최자 프로필' : '판매자 프로필';
    roleChipEl.classList.toggle('is-seller', !isHost);
    roleChipEl.hidden = false;
  }

  const introEl = document.getElementById('profile-intro');
  if (introEl) introEl.textContent = profile.introText || '등록된 한 줄 소개가 없어요.';

  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl && profile.profileImage) {
    avatarEl.innerHTML =
      `<img src="${API_BASE_URL}${escapeHtml(profile.profileImage)}" alt="프로필 사진" ` +
      `onerror="this.remove()" />`;
  }

  const bioTextEl = document.getElementById('profile-bio-text');
  if (bioTextEl) bioTextEl.textContent = profile.bioText || '등록된 소개글이 없어요.';

  const bioImageEl = document.getElementById('profile-bio-image');
  if (bioImageEl && profile.bioImage) {
    bioImageEl.innerHTML =
      `<img src="${API_BASE_URL}${escapeHtml(profile.bioImage)}" alt="소개 이미지" ` +
      `onerror="this.remove()" />`;
  }

  // 역할별 활동 요약
  const stats = profile.stats || {};
  if (isHost) {
    document.getElementById('host-stats-block').hidden = false;
    document.getElementById('stat-upcoming').textContent = stats.upcomingCount ?? 0;
    document.getElementById('stat-past').textContent = stats.pastCount ?? 0;
    document.getElementById('stat-cancelled').textContent = stats.cancelledCount ?? 0;
  } else {
    document.getElementById('seller-stats-block').hidden = false;
    document.getElementById('stat-participated').textContent = stats.participatedCount ?? 0;
    document.getElementById('stat-review-count').textContent = stats.reviewCount ?? 0;
  }

  // 평가 요약
  const review = profile.review || {};
  const section = document.getElementById('review-section');
  if (section) {
    section.hidden = false;
    const labelEl = document.getElementById('review-section-label');
    if (labelEl) labelEl.textContent = isHost ? '판매자 평가' : '주최자 평가';

    const avg = review.averageRating;
    document.getElementById('review-avg-score').textContent =
      avg !== null && avg !== undefined ? Number(avg).toFixed(1) : '-';
    document.getElementById('review-avg-stars').textContent =
      avg !== null && avg !== undefined ? renderStars(avg) : '☆☆☆☆☆';
    document.getElementById('review-count-text').textContent = `평가 ${review.reviewCount || 0}건`;
  }

  document.title = `${nickname}님의 프로필 - 플리마켓`;
}

function renderReviews(reviews) {
  const listEl = document.getElementById('review-list');
  if (!listEl) return;

  if (!reviews || reviews.length === 0) {
    listEl.innerHTML = '<li class="review-empty">아직 등록된 평가가 없어요.</li>';
    return;
  }

  listEl.innerHTML = reviews
    .map(
      (r) => `
    <li class="review-item">
      <div class="review-item-top">
        <span class="review-item-stars">${renderStars(r.rating)}</span>
        <span class="review-item-market">${escapeHtml(r.marketTitle)}</span>
      </div>
      ${r.comment ? `<p class="review-item-comment">${escapeHtml(r.comment)}</p>` : ''}
    </li>`
    )
    .join('');
}

async function load() {
  const userId = getTargetUserId();
  if (!userId) {
    showAlert('잘못된 주소예요. 프로필을 열 사용자를 찾을 수 없습니다.');
    return;
  }

  try {
    const res = await callApi(`/profiles/${userId}`);
    if (!res || !res.success || !res.data) {
      showAlert(res?.message || '프로필을 불러오지 못했어요.');
      return;
    }
    renderProfile(res.data);
  } catch (err) {
    console.error('프로필 조회 오류:', err);
    showAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    return;
  }

  try {
    const res = await callApi(`/profiles/${userId}/reviews`);
    if (res && res.success && res.data) renderReviews(res.data.reviews);
  } catch (err) {
    console.error('평가 목록 조회 오류:', err);
  }
}

document.addEventListener('DOMContentLoaded', load);
