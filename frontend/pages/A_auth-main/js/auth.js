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
          localStorage.setItem('token', result.data.token);
          localStorage.setItem('loggedInUser', JSON.stringify(result.data.user));

          if (result.data.user.activeRole === 'host') {
            window.location.href = '../B_host-seller/market-create.html';
          } else {
            window.location.href = '../B_host-seller/market-detail.html';
          }
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

/* ---------------------- 회원가입: 제출 ---------------------- */
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const role = selectedRoleInput ? selectedRoleInput.value : '';
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
    const phone = document.getElementById('phone')?.value.trim();
    const region = document.getElementById('region')?.value.trim();

    if (!role) {
      showAlert('가입 역할을 선택해주세요.');
      return;
    }
    if (!email || !password || !phone || !region) {
      showAlert('모든 항목을 입력해주세요.');
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
        body: { userType, email, password, phone, region },
      });

      if (result.success) {
        showAlert(result.message || '회원가입이 완료되었습니다!', 'success');

        if (result.data) {
          localStorage.setItem('token', result.data.token);
          localStorage.setItem('loggedInUser', JSON.stringify(result.data.user));
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
