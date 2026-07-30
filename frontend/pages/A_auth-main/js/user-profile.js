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
    renderHostSuccessRate(stats);
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

// [추가] 주최행사 성공율 도넛.
// 마이페이지(mypage.js renderHostStats)와 같은 계산식을 씁니다.
//   종료된 행사 = 지난 행사 + 취소,  성공율 = 지난 행사 / 종료된 행사
// 진행 중인 행사는 아직 결과가 안 나왔으므로 분모에서 뺍니다.
function renderHostSuccessRate(stats) {
  const block = document.getElementById('host-success-block');
  const donut = document.getElementById('stat-donut');
  const rateEl = document.getElementById('stat-donut-rate');
  if (!block || !donut || !rateEl) return;
  block.hidden = false;

  const upcoming = Number(stats.upcomingCount) || 0;
  const past = Number(stats.pastCount) || 0;
  const cancel = Number(stats.cancelledCount) || 0;
  const settled = past + cancel;

  const successEl = document.getElementById('rate-success');
  const cancelEl = document.getElementById('rate-cancelled');
  const pendingEl = document.getElementById('rate-pending');

  // 종료된 행사가 없으면 비율을 계산할 수 없습니다.
  // 표본이 0인데 0%로 보여주면 오해를 사므로 '–' 로 둡니다.
  if (settled === 0) {
    rateEl.textContent = '–';
    donut.style.background = 'conic-gradient(#e5ded2 0 100%)';
    donut.setAttribute('aria-label', '아직 종료된 행사가 없어 성공율을 집계할 수 없습니다.');
    if (successEl) successEl.textContent = '0 / 0';
    if (cancelEl) cancelEl.textContent = '0 / 0';
    if (pendingEl) {
      pendingEl.textContent = upcoming > 0
        ? `아직 종료된 행사가 없어요. 진행 중 ${upcoming}건은 종료 후 집계돼요.`
        : '아직 종료된 행사가 없어요.';
    }
    return;
  }

  const successPct = (past / settled) * 100;
  donut.style.background = `conic-gradient(#2f6b8f 0 ${successPct}%, #cfc6b8 ${successPct}% 100%)`;
  rateEl.textContent = `${successPct.toFixed(1)}%`;
  if (successEl) successEl.textContent = `${past} / ${settled}`;
  if (cancelEl) cancelEl.textContent = `${cancel} / ${settled}`;
  donut.setAttribute(
    'aria-label',
    `종료된 행사 ${settled}건 중 정상 개최 ${past}건, 취소 ${cancel}건`
  );

  // 표본이 적을 때 비율만 보고 오해하지 않도록 건수를 함께 알려줍니다.
  if (pendingEl) {
    const parts = [`종료된 행사 ${settled}건 기준`];
    if (settled < 3) parts.push('표본이 적어 참고용이에요');
    if (upcoming > 0) parts.push(`진행 중 ${upcoming}건은 집계 예정`);
    pendingEl.textContent = parts.join(' · ');
  }
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

  // [수정] 이 화면은 주소 끝에 ?userId=번호 가 반드시 있어야 동작합니다.
  //        번호 없이 파일을 직접 연 경우가 가장 흔해서, 무엇이 빠졌는지 알려줍니다.
  if (!userId) {
    const raw = new URLSearchParams(window.location.search).get('userId');
    console.error('[프로필] userId 파라미터가 없습니다. 현재 주소:', window.location.href);

    showAlert(
      raw === null
        ? '주소에 사용자 번호가 없어요. 이 화면은 마켓 상세나 신청자 목록에서 닉네임을 눌러 들어와야 합니다. (주소 형식: user-profile.html?userId=번호)'
        : `사용자 번호가 올바르지 않아요. (받은 값: "${raw}")`
    );

    // 파일을 직접 열어본 경우를 위해 되돌아갈 곳을 안내합니다.
    const badgeEl = document.getElementById('profile-title-badge');
    if (badgeEl) badgeEl.textContent = '프로필을 열 수 없어요';
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
