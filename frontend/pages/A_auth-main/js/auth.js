// 담당 A: 회원/로그인/마이페이지 프론트 로직
// 함수명은 docs/naming-convention.md 규칙(동사 시작 + camelCase)을 따릅니다.

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

function handleRoleSelectClick() {
  document.querySelectorAll('#role-select button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('selected-role').value = btn.dataset.role;
      document.getElementById('role-select').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
    });
  });
}

function handleRegisterSubmit() {
  const form = document.getElementById('register-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      role: document.getElementById('selected-role').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
      phone: document.getElementById('phone').value,
      region: document.getElementById('region').value,
    };
    await registerUser(payload);
  });
}

function handleLoginSubmit() {
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    };
    await loginUser(payload);
  });
}

function handleProfileFormSubmit() {
  const form = document.getElementById('profile-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      phone: document.getElementById('phone').value,
      region: document.getElementById('region').value,
      password: document.getElementById('password').value,
    };
    await updateUserProfile(payload);
  });
}

function handleRoleToggleChange() {
  const toggle = document.getElementById('role-toggle');
  if (!toggle) return;
  toggle.addEventListener('change', () => toggleUserRole());
}

function handleDeleteAccountClick() {
  const btn = document.getElementById('delete-account-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (confirm('정말 탈퇴하시겠습니까?')) deleteUserAccount();
  });
}

// 페이지별로 필요한 핸들러만 자동 바인딩됩니다 (없는 엘리먼트는 조용히 스킵)
document.addEventListener('DOMContentLoaded', () => {
  handleRoleSelectClick();
  handleRegisterSubmit();
  handleLoginSubmit();
  handleProfileFormSubmit();
  handleRoleToggleChange();
  handleDeleteAccountClick();
});
