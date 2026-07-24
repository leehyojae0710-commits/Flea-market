// A_auth-main/js/auth.js — 로그인 / 회원가입 공통 스크립트

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alert-box');
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.classList.remove('alert-error', 'alert-success');
  alertBox.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

/* ---------------------- 로그인 ---------------------- */
const loginForm = document.getElementById('login-form');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    if (!emailInput || !passwordInput) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const submitBtn = document.getElementById('login-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await callApi('/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      if (result.success) {
        showAlert(result.message || '로그인 성공!', 'success');

        if (result.data) {
          sessionStorage.setItem('token', result.data.token);
          sessionStorage.setItem('loggedInUser', JSON.stringify(result.data.user));

          // 로그인 직후엔 특정 마켓이 정해져 있지 않으므로
          // 역할과 무관하게 마켓 목록(메인 화면)으로 이동합니다.
          window.location.href = '../../index.html';
        }
      } else {
        showAlert(result.message || '로그인 실패: 아이디 혹은 비밀번호를 확인하세요.');
      }
    } catch (err) {
      console.error('로그인 에러:', err);
      showAlert('서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/* ---------------------- 회원가입: 역할 선택 ---------------------- */
const roleSelect = document.getElementById('role-select');
const registerForm = document.getElementById('register-form');
const selectedRoleInput = document.getElementById('selected-role');
const selectedRoleBanner = document.getElementById('selected-role-banner');
const selectedRoleText = document.getElementById('selected-role-text');
const changeRoleBtn = document.getElementById('change-role-btn');

const ROLE_LABEL = { host: '주최측', seller: '판매자' };

function selectRole(role) {
  if (selectedRoleInput) selectedRoleInput.value = role;

  document.querySelectorAll('.role-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.role === role);
  });

  if (roleSelect) roleSelect.style.display = 'none';
  if (selectedRoleBanner) selectedRoleBanner.style.display = 'flex';
  if (selectedRoleText) selectedRoleText.textContent = `${ROLE_LABEL[role] || role}(으)로 가입합니다`;
  if (registerForm) registerForm.style.display = 'block';
}

function resetRoleSelection() {
  if (selectedRoleInput) selectedRoleInput.value = '';
  document.querySelectorAll('.role-card').forEach((card) => card.classList.remove('selected'));
  if (roleSelect) roleSelect.style.display = 'grid';
  if (selectedRoleBanner) selectedRoleBanner.style.display = 'none';
  if (registerForm) registerForm.style.display = 'none';
}

if (roleSelect) {
  roleSelect.querySelectorAll('.role-card').forEach((card) => {
    card.addEventListener('click', () => selectRole(card.dataset.role));
  });
}

if (changeRoleBtn) {
  changeRoleBtn.addEventListener('click', resetRoleSelection);
}

/* ---------------------- 회원가입: 닉네임 중복 확인 ---------------------- */
const nicknameInput = document.getElementById('nickname');
const checkNicknameBtn = document.getElementById('check-nickname-btn');
const nicknameCheckMsg = document.getElementById('nickname-check-msg');
let isNicknameChecked = false; // 마지막으로 확인한 닉네임이 사용 가능한 상태인지

function setNicknameCheckMsg(message, ok) {
  if (!nicknameCheckMsg) return;
  nicknameCheckMsg.textContent = message;
  nicknameCheckMsg.classList.remove('ok', 'error');
  if (message) nicknameCheckMsg.classList.add(ok ? 'ok' : 'error');
}

if (checkNicknameBtn) {
  checkNicknameBtn.addEventListener('click', async () => {
    const nickname = nicknameInput ? nicknameInput.value.trim() : '';

    if (!isValidNickname(nickname)) {
      isNicknameChecked = false;
      setNicknameCheckMsg('닉네임은 한글/영문/숫자 2~12자로 입력해주세요.', false);
      return;
    }

    checkNicknameBtn.disabled = true;
    try {
      const result = await callApi(`/auth/check-nickname?nickname=${encodeURIComponent(nickname)}`);
      if (result.success && result.data?.available) {
        isNicknameChecked = true;
        setNicknameCheckMsg('사용할 수 있는 닉네임이에요.', true);
      } else {
        isNicknameChecked = false;
        setNicknameCheckMsg(result.message || '이미 사용 중인 닉네임이에요.', false);
      }
    } catch (err) {
      isNicknameChecked = false;
      setNicknameCheckMsg('서버에 연결할 수 없습니다.', false);
    } finally {
      checkNicknameBtn.disabled = false;
    }
  });
}

// 닉네임을 다시 수정하면 이전 중복 확인 결과는 무효로 처리 (확인 안 한 값으로 가입되는 것 방지)
if (nicknameInput) {
  nicknameInput.addEventListener('input', () => {
    isNicknameChecked = false;
    setNicknameCheckMsg('', false);
  });
}

/* ---------------------- 회원가입: 한줄소개/프로필 사진 최초 저장 ---------------------- */
// profile-edit.js의 uploadProfileRelatedImage와 동일한 패턴(먼저 업로드 -> 경로를 PATCH로 저장)입니다.
// 둘 다 선택 항목이라, 아무것도 입력 안 했으면 조용히 건너뜁니다.
async function saveInitialProfile(token, introText, profileImageFile) {
  if (!introText && !profileImageFile) return;

  let profileImagePath = null;

  if (profileImageFile) {
    try {
      const formData = new FormData();
      formData.append('profileImage', profileImageFile);

      const uploadRes = await fetch(`${API_BASE_URL}/upload/profile-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (uploadData.success) {
        profileImagePath = uploadData.filePath;
      } else {
        console.error('프로필 사진 업로드 실패:', uploadData.message);
      }
    } catch (err) {
      console.error('프로필 사진 업로드 오류:', err);
    }
  }

  if (!introText && !profileImagePath) return;

  try {
    const body = {};
    if (introText) body.introText = introText;
    if (profileImagePath) body.profileImage = profileImagePath;

    await fetch(`${API_BASE_URL}/users/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('초기 프로필 저장 오류:', err);
    // 가입 자체는 이미 성공했으니, 여기서 실패해도 가입 흐름은 막지 않습니다.
  }
}

/* ---------------------- 회원가입: 제출 ---------------------- */
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = selectedRoleInput ? selectedRoleInput.value : '';
    const nickname = nicknameInput ? nicknameInput.value.trim() : '';
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
    const phone = document.getElementById('phone')?.value.trim();
    const region = document.getElementById('region')?.value.trim();
    const introText = document.getElementById('intro-text')?.value.trim();
    const profileImageFile = document.getElementById('profile-image')?.files?.[0] || null;

    if (!role) {
      showAlert('가입 역할을 선택해주세요.');
      return;
    }
    if (!nickname || !email || !password || !phone || !region) {
      showAlert('모든 항목을 입력해주세요.');
      return;
    }
    if (!isValidNickname(nickname)) {
      showAlert('닉네임은 한글/영문/숫자 2~12자로 입력해주세요.');
      return;
    }
    if (!isNicknameChecked) {
      showAlert('닉네임 중복 확인을 먼저 해주세요.');
      return;
    }
    if (!isValidEmail(email)) {
      showAlert('이메일 형식이 올바르지 않아요. 예) you@example.com');
      return;
    }
    if (!isValidPhone(phone)) {
      showAlert('전화번호는 010-0000-0000 형식으로 입력해주세요.');
      return;
    }
    if (password.length < 8) {
      showAlert('비밀번호는 8자 이상이어야 합니다.');
      return;
    }

    const userType = role === 'host' ? 1 : 0;
    const submitBtn = document.getElementById('register-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await callApi('/auth/register', {
        method: 'POST',
        body: { userType, email, password, phone, region, nickname },
      });

      if (result.success) {
        showAlert(result.message || '회원가입이 완료되었습니다!', 'success');

        if (result.data) {
          sessionStorage.setItem('token', result.data.token);
          sessionStorage.setItem('loggedInUser', JSON.stringify(result.data.user));

          // [추가] 한줄소개/프로필 사진은 회원가입 API가 아니라 기존 프로필 API를 재사용해서 저장합니다.
          // (프로필 사진 업로드는 로그인 상태가 필요해서, 방금 발급받은 토큰으로 가입 직후에 처리해요.)
          await saveInitialProfile(result.data.token, introText, profileImageFile);
        }

        setTimeout(() => {
          window.location.href = 'login.html';
        }, 800);
      } else {
        showAlert(result.message || '회원가입에 실패했습니다.');
      }
    } catch (err) {
      console.error('회원가입 에러:', err);
      showAlert('서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
