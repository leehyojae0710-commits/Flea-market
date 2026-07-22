// 담당 B: 판매자 화면 - 내 부스 관리
// 함수명은 docs/naming-convention.md 규칙(동사 시작 + camelCase)을 따릅니다.
// 대기중(Pending) 상태의 신청만 수정·취소할 수 있습니다(백엔드 규칙과 동일).

// ---------- API 호출 ----------

async function getMyBoothList() {
  return callApi('/applications/my');
}

async function updateMyBoothApplication(applicationId, payload) {
  return callApi(`/applications/${applicationId}`, { method: 'PATCH', body: payload });
}

async function deleteMyBoothApplication(applicationId) {
  return callApi(`/applications/${applicationId}`, { method: 'DELETE' });
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

const STATUS_LABEL = { Pending: '대기중', Approved: '승인됨', Rejected: '반려됨' };
const STATUS_CLASS = { Pending: 'pending', Approved: 'approved', Rejected: 'rejected' };

// ---------- 상태 ----------

let myApplications = [];
let expandedId = null; // 상세정보가 펼쳐진 신청 id
let editingId = null;  // 수정 폼이 열린 신청 id

// ---------- 렌더링 ----------

function renderBoothList() {
  const wrap = document.getElementById('booth-list');
  const emptyState = document.getElementById('empty-state');
  if (!wrap) return;

  if (!myApplications || myApplications.length === 0) {
    wrap.innerHTML = '';
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  wrap.innerHTML = myApplications.map((a) => renderBoothCard(a)).join('');

  wrap.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener('click', () => handleToggleDetail(el.dataset.id));
  });
  wrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => handleEditClick(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="save-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSaveEdit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="cancel-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingId = null;
      renderBoothList();
    });
  });
}

function renderBoothCard(a) {
  const id = a.applicationId;
  const status = a.status || 'Pending';
  const isPending = status === 'Pending';
  const isExpanded = expandedId === String(id) || expandedId === id;
  const isEditing = editingId === String(id) || editingId === id;

  return `
    <div class="item-card" data-application-id="${id}">
      <div class="item-card-top">
        <div data-action="toggle" data-id="${id}" style="cursor:pointer;">
          <div class="item-card-title">${a.marketTitle || '마켓 정보 없음'} · ${a.boothNumber}번 부스${a.title ? ` · ${a.title}` : ''}</div>
          <div class="item-card-meta">${a.itemName || '이름 미입력'}</div>
        </div>
        <span class="status-tag ${STATUS_CLASS[status] || 'pending'}">${STATUS_LABEL[status] || status}</span>
      </div>

      <div class="item-card-actions">
        <button type="button" class="btn btn-outline btn-sm" data-action="edit" data-id="${id}" ${isPending ? '' : 'disabled title="대기중인 신청만 수정할 수 있어요."'}>수정</button>
        <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${id}" ${isPending ? '' : 'disabled title="대기중인 신청만 취소할 수 있어요."'}>삭제</button>
      </div>

      ${isExpanded ? renderBoothDetail(a, isEditing) : ''}
    </div>`;
}

function renderBoothDetail(a, isEditing) {
  if (isEditing) {
    return `
      <div class="item-card-detail">
        <div class="form-field">
          <label for="edit-item-name-${a.applicationId}">판매 물품 이름</label>
          <input type="text" id="edit-item-name-${a.applicationId}" class="form-input" value="${escapeAttr(a.itemName || '')}" />
        </div>
        <div class="form-field">
          <label for="edit-booth-number-${a.applicationId}">부스 번호</label>
          <input type="text" id="edit-booth-number-${a.applicationId}" class="form-input" value="${escapeAttr(a.boothNumber || '')}" />
        </div>
        <div class="form-field">
          <label for="edit-booth-title-${a.applicationId}">부스 이름</label>
          <input type="text" id="edit-booth-title-${a.applicationId}" class="form-input" value="${escapeAttr(a.title || '')}" placeholder="예: 민지네 빈티지샵" />
        </div>
        <div class="form-field">
          <label for="edit-product-desc-${a.applicationId}">판매 물품 소개</label>
          <textarea id="edit-product-desc-${a.applicationId}" class="form-textarea">${a.productDesc || ''}</textarea>
        </div>
        <div class="item-card-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="save-edit" data-id="${a.applicationId}">저장</button>
          <button type="button" class="btn btn-outline btn-sm" data-action="cancel-edit" data-id="${a.applicationId}">취소</button>
        </div>
      </div>`;
  }

  const eventDateLabel = a.eventDate_min
    ? `${new Date(a.eventDate_min).toLocaleDateString()} ~ ${a.eventDate_max ? new Date(a.eventDate_max).toLocaleDateString() : ''}`
    : '-';
  const imageSrc = a.itemImage
    ? (a.itemImage.startsWith('http') ? a.itemImage : `${API_BASE_URL}${a.itemImage}`)
    : null;
  return `
    <div class="item-card-detail">
      ${imageSrc ? `<img src="${imageSrc}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:10px;" />` : ''}
      <p class="item-card-meta">부스 이름: ${a.title || '등록된 이름이 없어요.'}</p>
      <p class="item-card-meta">행사 일자: ${eventDateLabel}</p>
      <p class="item-card-meta">장소: ${a.locationName || '-'}</p>
      <p class="item-card-meta">소개: ${a.productDesc || '등록된 소개가 없어요.'}</p>
    </div>`;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

// ---------- 이벤트 핸들러 ----------

function handleToggleDetail(id) {
  editingId = null;
  expandedId = expandedId === id ? null : id;
  renderBoothList();
}

function handleEditClick(id) {
  expandedId = id;
  editingId = id;
  renderBoothList();
}

async function handleSaveEdit(id) {
  hideAlert();
  const itemName = document.getElementById(`edit-item-name-${id}`)?.value.trim();
  const boothNumber = document.getElementById(`edit-booth-number-${id}`)?.value.trim();
  const title = document.getElementById(`edit-booth-title-${id}`)?.value.trim();
  const productDesc = document.getElementById(`edit-product-desc-${id}`)?.value.trim();

  if (!itemName || !boothNumber) {
    renderAlert('물품 이름과 부스 번호는 비워둘 수 없어요.');
    return;
  }

  try {
    const res = await updateMyBoothApplication(id, { itemName, boothNumber, title, productDesc });
    if (res && res.success) {
      renderAlert('신청 정보를 수정했어요.', 'success');
      editingId = null;
      await loadMyBoothList();
    } else {
      renderAlert(res?.message || '수정에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

async function handleDeleteClick(id) {
  hideAlert();
  const confirmed = window.confirm('이 부스 신청을 취소할까요? 취소 후에는 되돌릴 수 없어요.');
  if (!confirmed) return;

  try {
    const res = await deleteMyBoothApplication(id);
    if (res && res.success) {
      renderAlert('부스 신청을 취소했어요.', 'success');
      if (expandedId === id) expandedId = null;
      await loadMyBoothList();
    } else {
      renderAlert(res?.message || '취소에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

// ---------- 초기 로드 ----------

async function loadMyBoothList() {
  const wrap = document.getElementById('booth-list');
  if (!wrap) return;

  try {
    const res = await getMyBoothList();
    if (res && res.success) {
      myApplications = res.data || [];
      renderBoothList();
    } else {
      wrap.innerHTML = '<p class="list-empty">부스 목록을 불러오지 못했어요.</p>';
    }
  } catch (err) {
    wrap.innerHTML = '<p class="list-empty">서버에 연결할 수 없어요.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isLoggedIn = !!sessionStorage.getItem('loggedInUser');
  if (!isLoggedIn) {
    window.location.href = '../A_auth-main/login.html';
    return;
  }
  loadMyBoothList();
});
