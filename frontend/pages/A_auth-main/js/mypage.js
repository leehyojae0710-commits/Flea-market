// A_auth-main/js/mypage.js — 마이페이지: 정보수정 / 역할전환 / 탈퇴 / 로그아웃

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alert-box');
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.classList.remove('alert-error', 'alert-success');
  alertBox.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

/* ---------------------- 로그인 여부 확인 & 초기값 세팅 ---------------------- */
const rawUser = localStorage.getItem('loggedInUser');
let currentUser = rawUser ? JSON.parse(rawUser) : null;

if (!currentUser) {
  // 로그인 안 된 상태로 마이페이지 접근 시 로그인 화면으로 이동
  window.location.href = 'login.html';
}

const phoneInput = document.getElementById('phone');
const regionInput = document.getElementById('region');
const passwordInput = document.getElementById('password');
const profileForm = document.getElementById('profile-form');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');

function fillCurrentInfo() {
  if (!currentUser) return;
  if (phoneInput) phoneInput.value = currentUser.phone || '';
  if (regionInput) regionInput.value = currentUser.region || '';
}

fillCurrentInfo();

/* ---------------------- 개인정보 수정 (전화번호/지역) ---------------------- */
/* 백엔드 /api/users/me PATCH는 현재 phone, region만 지원합니다.
   비밀번호 변경은 아직 API가 없어서 입력 필드를 비활성화해뒀어요. */
if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const phone = phoneInput?.value.trim();
    const region = regionInput?.value.trim();

    if (phone && !isValidPhone(phone)) {
      showAlert('전화번호는 010-0000-0000 형식으로 입력해주세요.');
      return;
    }

    // 값이 비어있지 않은 항목만 전송 (부분 수정 PATCH)
    const body = {};
    if (phone) body.phone = phone;
    if (region) body.region = region;

    if (Object.keys(body).length === 0) {
      showAlert('수정할 내용을 입력해주세요.');
      return;
    }

    const submitBtn = document.getElementById('profile-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await callApi('/users/me', { method: 'PATCH', body });

      if (result.success) {
        showAlert(result.message || '정보가 수정되었습니다.', 'success');
        // 백엔드가 최신 사용자 정보를 그대로 돌려주므로 그걸 기준으로 저장합니다.
        currentUser = result.data ? { ...currentUser, ...result.data } : { ...currentUser, ...body };
        localStorage.setItem('loggedInUser', JSON.stringify(currentUser));
      } else {
        showAlert(result.message || '정보 수정에 실패했습니다.');
      }
    } catch (err) {
      console.error('정보 수정 에러:', err);
      showAlert('서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/* ---------------------- 로그아웃 ---------------------- */
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('loggedInUser');
    window.location.href = 'login.html';
  });
}

/* ---------------------- 회원 탈퇴 ---------------------- */
if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener('click', async () => {
    const confirmed = window.confirm('정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.');
    if (!confirmed) return;

    deleteAccountBtn.disabled = true;

    try {
      const result = await callApi('/users/me', { method: 'DELETE' });

      if (result.success) {
        showAlert(result.message || '회원 탈퇴가 완료되었습니다.', 'success');
        localStorage.removeItem('token');
        localStorage.removeItem('loggedInUser');
        setTimeout(() => {
          window.location.href = '../../index.html';
        }, 800);
      } else {
        showAlert(result.message || '회원 탈퇴에 실패했습니다.');
      }
    } catch (err) {
      console.error('회원 탈퇴 에러:', err);
      showAlert('서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.');
    } finally {
      deleteAccountBtn.disabled = false;
    }
  });
}
