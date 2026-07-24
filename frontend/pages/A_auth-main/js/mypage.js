// A_auth-main/js/mypage.js — 마이페이지 "프로필 보기" 화면
// 정보 수정/비밀번호 변경/탈퇴 폼은 profile-edit.html + js/profile-edit.js로 옮겼습니다.

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

/* ---------------------- 프로필 정보 렌더링 ---------------------- */
function renderProfile(profile) {
  const nickname = profile.nickname || '이름 미입력';
  const isHost = Number(profile.userType) === 1;
  const titleText = isHost ? `${nickname}님의 플리마켓` : `판매자 ${nickname}님`;

  const badgeEl = document.getElementById('profile-title-badge');
  if (badgeEl) {
    badgeEl.textContent = titleText;
  }

  const introEl = document.getElementById('profile-intro');
  if (introEl) {
    introEl.textContent = profile.introText || '한 줄 소개를 등록해보세요.';
  }

  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl && profile.profileImage) {
    avatarEl.innerHTML = `<img src="${API_BASE_URL}${profile.profileImage}" alt="프로필 사진" />`;
  }

  const bioTextEl = document.getElementById('profile-bio-text');
  if (bioTextEl) {
    bioTextEl.textContent = profile.bioText || '등록된 소개글이 없어요.';
  }

  const bioImageEl = document.getElementById('profile-bio-image');
  if (bioImageEl && profile.bioImage) {
    bioImageEl.innerHTML = `<img src="${API_BASE_URL}${profile.bioImage}" alt="소개 이미지" />`;
  }
}

function renderStats(stats) {
  const upcomingEl = document.getElementById('stat-upcoming');
  const pastEl = document.getElementById('stat-past');
  const cancelledEl = document.getElementById('stat-cancelled');
  if (upcomingEl) upcomingEl.textContent = stats.upcomingCount ?? 0;
  if (pastEl) pastEl.textContent = stats.pastCount ?? 0;
  if (cancelledEl) cancelledEl.textContent = stats.cancelledCount ?? 0;

  renderSuccessChart(stats);
}
/* [수정] 주최행사 성공율 — 종료된 행사(지난+취소)만 모집단 */
function renderSuccessChart(stats) {
  const donut = document.getElementById('stat-donut');
  const rateEl = document.getElementById('stat-donut-rate');
  if (!donut || !rateEl) return;

  const upcoming = Number(stats.upcomingCount) || 0;
  const past = Number(stats.pastCount) || 0;
  const cancel = Number(stats.cancelledCount) || 0;

  const settled = past + cancel;   // 결과가 확정된 행사만
  const successEl = document.getElementById('rate-success');
  const cancelEl = document.getElementById('rate-cancelled');
  const pendingEl = document.getElementById('rate-pending');

  if (pendingEl) {
    pendingEl.textContent = upcoming > 0 ? `진행 중 ${upcoming}건은 집계 예정` : '';
  }

  if (settled === 0) {
    rateEl.textContent = '–';
    donut.style.background = 'conic-gradient(#e5ded2 0 100%)';
    if (successEl) successEl.textContent = '0 / 0';
    if (cancelEl) cancelEl.textContent = '0 / 0';
    return;
  }

  const successPct = (past / settled) * 100;
  donut.style.background =
    `conic-gradient(#2f6b8f 0 ${successPct}%, #cfc6b8 ${successPct}% 100%)`;
  rateEl.textContent = `${successPct.toFixed(1)}%`;
  if (successEl) successEl.textContent = `${past} / ${settled}`;
  if (cancelEl) cancelEl.textContent = `${cancel} / ${settled}`;
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
      renderStats(res.data);
    }
  } catch (err) {
    console.error('행사 현황 조회 오류:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadStats();
});
