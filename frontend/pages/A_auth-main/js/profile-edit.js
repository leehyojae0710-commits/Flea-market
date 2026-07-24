// A_auth-main/js/profile-edit.js — 내 정보 수정: 프로필 설정 / 전화번호·지역 / 비밀번호 / 탈퇴·로그아웃
// 기존 mypage.js에 있던 전화번호/지역/비밀번호/로그아웃/탈퇴 로직은 그대로 옮겨왔고,
// 닉네임/한줄소개/프로필사진/소개글/소개이미지(프로필 설정) 로직을 새로 추가했습니다.

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alert-box');
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.classList.remove('alert-error', 'alert-success');
  alertBox.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

/* ---------------------- 로그인 여부 확인 & 초기값 세팅 ---------------------- */
const rawUser = sessionStorage.getItem('loggedInUser');
let currentUser = rawUser ? JSON.parse(rawUser) : null;

if (!currentUser) {
  window.location.href = 'login.html';
}

const phoneInput = document.getElementById('phone');
const regionInput = document.getElementById('region');
const profileForm = document.getElementById('profile-form');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');

const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const newPasswordConfirmInput = document.getElementById('new-password-confirm');
const passwordForm = document.getElementById('password-form');

function fillCurrentInfo() {
  if (!currentUser) return;
  if (phoneInput) phoneInput.value = currentUser.phone || '';
  if (regionInput) regionInput.value = currentUser.region || '';
}

fillCurrentInfo();

/* ---------------------- 개인정보 수정 (전화번호/지역) ---------------------- */
if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const phone = phoneInput?.value.trim();
    const region = regionInput?.value.trim();

    const phoneChanged = !!phone && phone !== (currentUser?.phone || '');
    const regionChanged = !!region && region !== (currentUser?.region || '');

    if (phoneChanged && !isValidPhone(phone)) {
      showAlert('전화번호는 010-0000-0000 형식으로 입력해주세요.');
      return;
    }

    const body = {};
    if (phoneChanged) body.phone = phone;
    if (regionChanged) body.region = region;

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
        currentUser = result.data ? { ...currentUser, ...result.data } : { ...currentUser, ...body };
        sessionStorage.setItem('loggedInUser', JSON.stringify(currentUser));
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

/* ---------------------- 비밀번호 변경 ---------------------- */
if (passwordForm) {
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = currentPasswordInput?.value;
    const newPassword = newPasswordInput?.value;
    const newPasswordConfirm = newPasswordConfirmInput?.value;

    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      showAlert('현재 비밀번호와 새 비밀번호를 모두 입력해주세요.');
      return;
    }
    if (newPassword.length < 8) {
      showAlert('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      showAlert('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPassword === currentPassword) {
      showAlert('새 비밀번호는 현재 비밀번호와 달라야 합니다.');
      return;
    }

    const submitBtn = document.getElementById('password-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await callApi('/users/me/password', {
        method: 'PATCH',
        body: { currentPassword, newPassword },
      });

      if (result.success) {
        showAlert(result.message || '비밀번호가 변경되었습니다.', 'success');
        passwordForm.reset();
      } else {
        showAlert(result.message || '비밀번호 변경에 실패했습니다.');
      }
    } catch (err) {
      console.error('비밀번호 변경 에러:', err);
      showAlert('서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/* ---------------------- 로그아웃 ---------------------- */
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await logoutUser();
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
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('loggedInUser');
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

/* =====================================================================
   프로필 설정 (닉네임 / 한 줄 소개 / 프로필 사진) + 소개 관리 (소개글 / 소개 이미지)
   ===================================================================== */

const profileBasicForm = document.getElementById('profile-basic-form');
const profileBioForm = document.getElementById('profile-bio-form');
const nicknameInput = document.getElementById('nickname');
const introTextInput = document.getElementById('intro-text');
const bioTextInput = document.getElementById('bio-text');
const profileImageInput = document.getElementById('profile-image');
const bioImageInput = document.getElementById('bio-image');
const uploadedProfileImagePathInput = document.getElementById('uploaded-profile-image-path');
const uploadedBioImagePathInput = document.getElementById('uploaded-bio-image-path');

// 기존 마켓/부스 이미지와 동일한 "현재 등록된 이미지" 미리보기 패턴 (marketcorrection.js / boothedit.js 참고)
function renderCurrentImagePreview(statusElId, imagePath) {
  const statusEl = document.getElementById(statusElId);
  if (!statusEl) return;
  if (!imagePath) {
    statusEl.innerHTML = '';
    return;
  }
  statusEl.innerHTML = `
    <p class="form-hint">현재 등록된 이미지</p>
    <img src="${API_BASE_URL}${imagePath}" alt="" class="preview-image" />
  `;
}

async function loadProfileForEdit() {
  try {
    const res = await callApi('/users/me/profile');
    if (!res || !res.success || !res.data) {
      showAlert(res?.message || '프로필 정보를 불러오지 못했습니다.');
      return;
    }
    const profile = res.data;

    if (nicknameInput) nicknameInput.value = profile.nickname || '';
    if (introTextInput) introTextInput.value = profile.introText || '';
    if (bioTextInput) bioTextInput.value = profile.bioText || '';

    // 새 이미지를 업로드하지 않으면 이 값이 그대로 PATCH에 실려서 기존 이미지가 유지됩니다.
    if (uploadedProfileImagePathInput) uploadedProfileImagePathInput.value = profile.profileImage || '';
    if (uploadedBioImagePathInput) uploadedBioImagePathInput.value = profile.bioImage || '';

    renderCurrentImagePreview('profile-image-status', profile.profileImage);
    renderCurrentImagePreview('bio-image-status', profile.bioImage);
  } catch (err) {
    console.error('프로필 정보 조회 오류:', err);
    showAlert('서버에 연결할 수 없습니다.');
  }
}

// 이미지 업로드 (marketcorrection.js의 uploadMarketImage와 동일한 패턴).
// 프로필/소개 이미지 업로드는 로그인한 사용자 폴더에 저장되므로 Authorization 헤더가 필요합니다.
async function uploadProfileRelatedImage(fileInput, uploadUrl, fieldName, hiddenInput) {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append(fieldName, file);

  const token = sessionStorage.getItem('token');

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    const data = await response.json();

    if (data.success) {
      hiddenInput.value = data.filePath;
    } else {
      showAlert(data.message || '이미지 업로드에 실패했습니다.');
    }
  } catch (err) {
    console.error('이미지 업로드 오류:', err);
    showAlert('이미지 업로드 중 서버에 연결할 수 없습니다.');
  }
}

// [프로필 설정 탭] 닉네임 / 한 줄 소개 / 프로필 사진만 저장
if (profileBasicForm) {
  profileBasicForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlertBox();

    const submitBtn = document.getElementById('profile-basic-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (profileImageInput.files && profileImageInput.files[0]) {
        await uploadProfileRelatedImage(
          profileImageInput,
          `${API_BASE_URL}/upload/profile-image`,
          'profileImage',
          uploadedProfileImagePathInput
        );
      }

      const body = {
        nickname: nicknameInput.value.trim(),
        introText: introTextInput.value.trim(),
        profileImage: uploadedProfileImagePathInput.value || null,
      };

      const result = await callApi('/users/me/profile', { method: 'PATCH', body });

      if (result.success) {
        showAlert(result.message || '프로필이 저장되었습니다.', 'success');
        renderCurrentImagePreview('profile-image-status', result.data?.profileImage);
      } else {
        showAlert(result.message || '프로필 저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('프로필 저장 오류:', err);
      showAlert('서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// [소개 관리 탭] 소개글 / 소개 이미지만 저장
if (profileBioForm) {
  profileBioForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlertBox();

    const submitBtn = document.getElementById('profile-bio-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      if (bioImageInput.files && bioImageInput.files[0]) {
        await uploadProfileRelatedImage(
          bioImageInput,
          `${API_BASE_URL}/upload/bio-image`,
          'bioImage',
          uploadedBioImagePathInput
        );
      }

      const body = {
        bioText: bioTextInput.value.trim(),
        bioImage: uploadedBioImagePathInput.value || null,
      };

      const result = await callApi('/users/me/profile', { method: 'PATCH', body });

      if (result.success) {
        showAlert(result.message || '소개가 저장되었습니다.', 'success');
        renderCurrentImagePreview('bio-image-status', result.data?.bioImage);
      } else {
        showAlert(result.message || '소개 저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('소개 저장 오류:', err);
      showAlert('서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function hideAlertBox() {
  const box = document.getElementById('alert-box');
  if (box) box.classList.remove('show');
}

/* ---------------------- 좌측 세로 탭 전환 ---------------------- */
const editTabButtons = document.querySelectorAll('.edit-tab-btn');
editTabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    editTabButtons.forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.edit-panel').forEach((p) => p.classList.remove('active'));

    btn.classList.add('active');
    const panel = document.getElementById(btn.dataset.panel);
    if (panel) panel.classList.add('active');
  });
});

document.addEventListener('DOMContentLoaded', () => {
  loadProfileForEdit();
});
