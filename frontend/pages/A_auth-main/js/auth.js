// 담당 A: 회원/로그인/마이페이지 프론트 로직
// 함수명은 docs/naming-convention.md 규칙(동사 시작 + camelCase)을 따릅니다.

const AUTH_SESSION_KEY = 'flea_logged_in';

// ---------- API 호출 (docs/api-routes.md 계약 그대로 사용) ----------

async function registerUser(payload) {
  // payload: { role, email, password, phone, region }
  return callApi('/auth/register', { method: 'POST', body: payload });
}

async function loginUser(payload) {
  // payload: { email, password }
  return callApi('/auth/login', { method: 'POST', body: payload });
}

async function logoutUser() {
  return callApi('/auth/logout', { method: 'POST' });
}

async function updateUserProfile(payload) {
  return callApi('/users/me', { method: 'PATCH', body: payload });
}

async function deleteUserAccount() {
  return callApi('/users/me', { method: 'DELETE' });
}

async function toggleUserRole() {
  return callApi('/auth/toggle-role', { method: 'PATCH' });
}

// ---------- 화면 피드백 유틸 ----------

function renderAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('alert-error', 'alert-success');
  box.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.classList.remove('show');
}

function setButtonLoading(btn, isLoading, loadingText, defaultText) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? loadingText : defaultText;
}

// ---------- 회원가입 ----------

function handleRoleSelectClick() {
  const roleButtons = document.querySelectorAll('#role-select .role-card');
  if (!roleButtons.length) return;

  roleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      document.getElementById('selected-role').value = role;
      document.getElementById('role-select').style.display = 'none';

      const banner = document.getElementById('selected-role-banner');
      const bannerText = document.getElementById('selected-role-text');
      if (banner && bannerText) {
        bannerText.textContent =
          role === 'host' ? '📋 주최측으로 가입합니다' : '🧺 판매자로 가입합니다';
        banner.style.display = 'flex';
      }

      document.getElementById('register-form').style.display = 'block';
    });
  });

  const changeRoleBtn = document.getElementById('change-role-btn');
  if (changeRoleBtn) {
    changeRoleBtn.addEventListener('click', () => {
      document.getElementById('selected-role').value = '';
      document.getElementById('role-select').style.display = 'grid';
      document.getElementById('selected-role-banner').style.display = 'none';
      document.getElementById('register-form').style.display = 'none';
    });
  }
}

function handleRegisterSubmit() {
  const form = document.getElementById('register-form');
  if (!form) return;
  const submitBtn = document.getElementById('register-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const payload = {
      role: document.getElementById('selected-role').value,
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
      phone: document.getElementById('phone').value.trim(),
      region: document.getElementById('region').value.trim(),
    };

    if (!payload.role) {
      renderAlert('가입 역할을 먼저 선택해주세요.');
      return;
    }
    if (payload.password.length < 8) {
      renderAlert('비밀번호는 8자 이상이어야 해요.');
      return;
    }

    setButtonLoading(submitBtn, true, '가입 처리 중...', '가입하기');
    try {
      const res = await registerUser(payload);
      if (res && res.success) {
        renderAlert('가입이 완료됐어요! 로그인 페이지로 이동합니다.', 'success');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1200);
      } else {
        renderAlert(res?.message || '가입에 실패했어요. 입력값을 확인해주세요.');
        setButtonLoading(submitBtn, false, '가입 처리 중...', '가입하기');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      setButtonLoading(submitBtn, false, '가입 처리 중...', '가입하기');
    }
  });
}

// ---------- 로그인 ----------

function handleLoginSubmit() {
  const form = document.getElementById('login-form');
  if (!form) return;
  const submitBtn = document.getElementById('login-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const payload = {
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };

    setButtonLoading(submitBtn, true, '로그인 중...', '로그인');
    try {
      const res = await loginUser(payload);
      if (res && res.success) {
        localStorage.setItem(AUTH_SESSION_KEY, '1');
        renderAlert('로그인 성공! 이동 중입니다.', 'success');
        const redirectTo = new URLSearchParams(window.location.search).get('redirect');
        setTimeout(() => {
          window.location.href = redirectTo || '../../index.html';
        }, 600);
      } else {
        renderAlert(res?.message || '이메일 또는 비밀번호를 확인해주세요.');
        setButtonLoading(submitBtn, false, '로그인 중...', '로그인');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      setButtonLoading(submitBtn, false, '로그인 중...', '로그인');
    }
  });
}

// ---------- 마이페이지 ----------

function requireLoginOnMypage() {
  const isMypage = !!document.getElementById('profile-form');
  if (!isMypage) return;
  if (!localStorage.getItem(AUTH_SESSION_KEY)) {
    window.location.href = `login.html?redirect=mypage.html`;
  }
}

function handleProfileFormSubmit() {
  const form = document.getElementById('profile-form');
  if (!form) return;
  const submitBtn = document.getElementById('profile-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const password = document.getElementById('password').value;
    if (password && password.length < 8) {
      renderAlert('비밀번호는 8자 이상이어야 해요.');
      return;
    }

    const payload = {
      phone: document.getElementById('phone').value.trim(),
      region: document.getElementById('region').value.trim(),
      password: password || undefined,
    };

    setButtonLoading(submitBtn, true, '저장 중...', '정보 수정');
    try {
      const res = await updateUserProfile(payload);
      if (res && res.success) {
        renderAlert('정보가 수정됐어요.', 'success');
        document.getElementById('password').value = '';
      } else {
        renderAlert(res?.message || '수정에 실패했어요.');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setButtonLoading(submitBtn, false, '저장 중...', '정보 수정');
    }
  });
}

function handleRoleToggleChange() {
  const toggle = document.getElementById('role-toggle');
  if (!toggle) return;
  const caption = document.getElementById('role-mode-caption');

  toggle.addEventListener('change', async () => {
    hideAlert();
    try {
      const res = await toggleUserRole();
      if (res && res.success) {
        if (caption) {
          caption.textContent = toggle.checked
            ? '현재: 주최자 모드'
            : '현재: 셀러 모드';
        }
        renderAlert('역할이 전환됐어요.', 'success');
      } else {
        toggle.checked = !toggle.checked;
        renderAlert(res?.message || '역할 전환에 실패했어요.');
      }
    } catch (err) {
      toggle.checked = !toggle.checked;
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
  });
}

function handleDeleteAccountClick() {
  const btn = document.getElementById('delete-account-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없어요.')) return;
    hideAlert();
    try {
      const res = await deleteUserAccount();
      if (res && res.success) {
        localStorage.removeItem(AUTH_SESSION_KEY);
        alert('탈퇴가 완료됐어요. 이용해주셔서 감사합니다.');
        window.location.href = '../../index.html';
      } else {
        renderAlert(res?.message || '탈퇴 처리에 실패했어요.');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
  });
}

function handleLogoutClick() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try {
      await logoutUser();
    } finally {
      localStorage.removeItem(AUTH_SESSION_KEY);
      window.location.href = '../../index.html';
    }
  });
}

// 페이지별로 필요한 핸들러만 자동 바인딩됩니다 (없는 엘리먼트는 조용히 스킵)
document.addEventListener('DOMContentLoaded', () => {
  requireLoginOnMypage();
  handleRoleSelectClick();
  handleRegisterSubmit();
  handleLoginSubmit();
  handleProfileFormSubmit();
  handleRoleToggleChange();
  handleDeleteAccountClick();
  handleLogoutClick();
});
