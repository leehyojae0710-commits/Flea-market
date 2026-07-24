// js/boothedit.js
// 부스 수정 페이지 전용 스크립트 (correctionMarket.html의 marketcorrection.js와 동일한 패턴)
// 흐름: URL에서 applicationId 읽기 -> 내 신청 목록에서 해당 건 찾기 -> 폼에 채우기 -> 제출 시 PATCH
// 단일 조회(GET /applications/:id) 엔드포인트가 없어서, 이미 있는 GET /applications/my 목록에서 찾아 씁니다.

// ============================================
// 0. URL에서 applicationId 가져오기
// ============================================
function getApplicationIdFromUrl() {
  return new URLSearchParams(window.location.search).get('applicationId');
}

// ============================================
// 1. API 호출
// ============================================
async function getMyBoothList() {
  return callApi('/applications/my');
}

async function updateMyBoothApplication(applicationId, payload) {
  return callApi(`/applications/${applicationId}`, { method: 'PATCH', body: payload });
}

// ============================================
// 2. 화면 피드백 유틸 (market.js / mybooth.js와 동일)
// ============================================
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

// ============================================
// 3. 기존 신청 정보를 불러와서 폼에 채워 넣기
// ============================================
async function loadApplicationForEdit(applicationId) {
  const submitBtn = document.getElementById('booth-edit-submit-btn');
  try {
    const res = await getMyBoothList();
    if (!res || !res.success) {
      renderAlert('부스 정보를 불러오지 못했어요.');
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const application = (res.data || []).find((a) => String(a.applicationId) === String(applicationId));
    if (!application) {
      renderAlert('수정할 부스 신청을 찾을 수 없어요. 내 부스 관리에서 다시 시도해주세요.');
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    // 대기중(Pending) 상태가 아니면 서버에서도 거부되므로, 미리 안내하고 제출을 막습니다.
    if ((application.status || 'Pending') !== 'Pending') {
      renderAlert('이미 승인/반려된 신청은 수정할 수 없어요. 대기중인 신청만 수정할 수 있어요.');
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const sub = document.getElementById('booth-edit-sub');
    if (sub) sub.textContent = `${application.marketTitle || ''} · ${application.boothNumber}번 부스 정보를 수정해주세요.`;

    document.getElementById('booth-number').value = application.boothNumber || '';
    document.getElementById('booth-title').value = application.title || '';
    document.getElementById('item-name').value = application.itemName || '';
    document.getElementById('product-desc').value = application.productDesc || '';

    // 새 이미지를 업로드하지 않으면 이 기존 경로를 그대로 다시 제출합니다.
    document.getElementById('uploaded-item-image-path').value = application.itemImage || '';

    if (application.itemImage) {
      const statusEl = document.getElementById('current-image-status');
      const imageSrc = application.itemImage.startsWith('http')
        ? application.itemImage
        : `http://localhost:5000/api${application.itemImage}`;
      if (statusEl) {
        statusEl.innerHTML = `
          <p class="form-hint">현재 등록된 이미지</p>
          <img src="${imageSrc}" alt="" style="max-width:100%;max-height:180px;border-radius:8px;margin-top:6px;" />
        `;
      }
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    if (submitBtn) submitBtn.disabled = true;
  }
}

// ============================================
// 4. 이미지 미리보기 (새로 선택했을 때만)
// ============================================
function handleProductImagePreview() {
  const input = document.getElementById('product-image');
  const preview = document.getElementById('product-image-preview');
  if (!input || !preview) return;

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) {
      preview.style.display = 'none';
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  });
}

// ============================================
// 5. 이미지 업로드 (새 파일을 선택했을 때만 호출, booth-apply와 동일한 흐름)
// ============================================
async function uploadItemImage() {
  const fileInput = document.getElementById('product-image');
  const file = fileInput?.files?.[0];
  if (!file) return; // 안 바꿨으면 기존 uploaded-item-image-path 값 그대로 사용

  const boothTitle = document.getElementById('booth-title')?.value.trim() || '';

  const formData = new FormData();
  formData.append('title', boothTitle);
  formData.append('itemImage', file);

  try {
    const response = await fetch('http://localhost:5000/api/upload/item-image', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();

    if (data.success) {
      document.getElementById('uploaded-item-image-path').value = data.filePath;
    } else {
      renderAlert(data.message || '이미지 업로드에 실패했어요.');
    }
  } catch (err) {
    renderAlert('이미지 업로드 중 서버에 연결할 수 없어요.');
  }
}

// ============================================
// 6. 폼 제출 (수정 전용, PATCH 호출)
// ============================================
function handleBoothEditSubmit(applicationId) {
  const form = document.getElementById('booth-edit-form');
  if (!form) return;
  const submitBtn = document.getElementById('booth-edit-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const payload = {
      boothNumber: document.getElementById('booth-number').value.trim(),
      title: document.getElementById('booth-title').value.trim(),
      itemName: document.getElementById('item-name').value.trim(),
      productDesc: document.getElementById('product-desc').value.trim(),
    };

    if (!payload.boothNumber) {
      renderAlert('부스 번호를 입력해주세요.');
      return;
    }
    if (!payload.title) {
      renderAlert('부스 이름을 입력해주세요.');
      return;
    }
    if (!payload.itemName) {
      renderAlert('판매 물품 이름을 입력해주세요.');
      return;
    }

    setButtonLoading(submitBtn, true, '수정 중...', '수정하기');
    await uploadItemImage();
    payload.itemImage = document.getElementById('uploaded-item-image-path').value || null;

    try {
      const res = await updateMyBoothApplication(applicationId, payload);
      if (res && res.success) {
        renderAlert('부스 정보를 수정했어요!', 'success');
        setTimeout(() => {
          window.location.href = 'mybooth.html';
        }, 1000);
      } else {
        renderAlert(res?.message || '수정에 실패했어요. 입력값을 확인해주세요.');
        setButtonLoading(submitBtn, false, '수정 중...', '수정하기');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      setButtonLoading(submitBtn, false, '수정 중...', '수정하기');
    }
  });
}

// ============================================
// 초기 실행: 로그인 확인 -> applicationId 확인 -> 기존 정보 로드 -> 제출 이벤트 연결
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  const isLoggedIn = !!sessionStorage.getItem('loggedInUser');
  if (!isLoggedIn) {
    window.location.href = '../A_auth-main/login.html';
    return;
  }

  const applicationId = getApplicationIdFromUrl();
  document.getElementById('application-id').value = applicationId || '';

  if (!applicationId) {
    renderAlert('잘못된 접근이에요. 내 부스 관리에서 "수정" 버튼을 눌러 다시 시도해주세요.');
    const submitBtn = document.getElementById('booth-edit-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  handleProductImagePreview();
  handleBoothEditSubmit(applicationId);
  await loadApplicationForEdit(applicationId);
});
