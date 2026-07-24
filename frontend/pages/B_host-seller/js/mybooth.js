// 담당 B: 판매자 화면 - 내 부스 관리
// 함수명은 docs/naming-convention.md 규칙(동사 시작 + camelCase)을 따릅니다.
// 대기중(Pending) 상태의 신청만 수정·취소할 수 있습니다(백엔드 규칙과 동일).

// ---------- API 호출 ----------

async function getMyBoothList() {
  return callApi('/applications/my');
}

async function deleteMyBoothApplication(applicationId) {
  return callApi(`/applications/${applicationId}`, { method: 'DELETE' });
}

// [추가] 행사 평가(별점) 등록
async function submitBoothReview(applicationId, rating) {
  return callApi('/reviews', { method: 'POST', body: { applicationId: Number(applicationId), rating } });
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

let allApplications = [];
let myApplications = [];
let statusFilter = '';
let expandedId = null; // 상세정보가 펼쳐진 신청 id
let reviewOpenId = null; // 별점 입력창이 펼쳐진 신청 id (문자열로 비교)
let reviewDraftRating = 0; // 별점 입력창에서 아직 제출 전인 값 (0~5)

// ---------- 렌더링 ----------

function renderBoothList() {
  const wrap = document.getElementById('booth-list');
  const emptyState = document.getElementById('empty-state');
  const countEl = document.getElementById('result-count');
  if (!wrap) return;

  if (countEl) {
    countEl.textContent = allApplications.length === 0 ? '' : `${myApplications.length}건`;
  }

  if (!myApplications || myApplications.length === 0) {
    wrap.innerHTML = '';
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.textContent = allApplications.length === 0
        ? '아직 신청한 부스가 없어요.'
        : '해당 상태의 신청이 없어요.';
    }
    return;
  }
  if (emptyState) emptyState.hidden = true;

  wrap.innerHTML = myApplications.map((a) => renderBoothCard(a)).join('');

  wrap.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener('click', () => handleToggleDetail(el.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="review-toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReviewToggle(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="star-pick"]').forEach((btn) => {
    btn.addEventListener('click', () => handleStarPick(Number(btn.dataset.value)));
  });
  wrap.querySelectorAll('[data-action="review-reset"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReviewReset());
  });
  wrap.querySelectorAll('[data-action="review-submit"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReviewSubmit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="review-cancel"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReviewCancel());
  });
}

function renderBoothCard(a) {
  const id = a.applicationId;
  const status = a.status || 'Pending';
  const isPending = status === 'Pending';
  const isExpanded = expandedId === String(id) || expandedId === id;

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
        <div class="action-group">
          <a class="btn btn-outline btn-sm" href="${isPending ? `booth-edit?applicationId=${id}` : '#'}" ${isPending ? '' : 'aria-disabled="true" tabindex="-1" title="대기중인 신청만 수정할 수 있어요." onclick="return false;"'}>수정</a>
          <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${id}" ${isPending ? '' : 'disabled title="대기중인 신청만 취소할 수 있어요."'}>삭제</button>
        </div>
        ${status === 'Approved' ? renderReviewTrigger(a) : ''}
      </div>

      ${status === 'Approved' && reviewOpenId === String(id) ? renderReviewForm(id) : ''}
      ${isExpanded ? renderBoothDetail(a) : ''}
    </div>`;
}

// ---------- 행사 평가(별점) ----------

// 백엔드가 (m.eventDate_max < CURDATE())로 내려주는 값(1/0 또는 true/false)을 그대로 boolean으로 취급
function isEventEnded(a) {
  return !!a.eventEnded;
}

function renderStaticStars(rating) {
  const full = '★'.repeat(rating);
  const empty = '☆'.repeat(5 - rating);
  return `<span class="stars-static" aria-label="${rating}점">${full}${empty}</span>`;
}

// 수정·삭제와 같은 줄, 오른쪽에 배치되는 부분 (평가하기 버튼 또는 이미 남긴 별점 표시)
function renderReviewTrigger(a) {
  const id = a.applicationId;
  const hasReview = a.myRating !== null && a.myRating !== undefined;
  const eventEnded = isEventEnded(a);

  if (hasReview) {
    return `
      <span class="review-summary">
        <span class="review-label">내 평가</span>
        ${renderStaticStars(a.myRating)}
        <span class="review-score">${a.myRating}점</span>
      </span>`;
  }

  return `
    <button type="button" class="btn btn-outline btn-sm" data-action="review-toggle" data-id="${id}"
      ${eventEnded ? '' : 'disabled title="행사가 끝난 뒤에 평가할 수 있어요."'}>
      행사 평가하기
    </button>`;
}

function renderReviewForm(id) {
  return `
    <div class="review-form">
      <div class="star-picker">
        ${[1, 2, 3, 4, 5].map((n) => `
          <button type="button" class="star-btn ${n <= reviewDraftRating ? 'filled' : ''}" data-action="star-pick" data-value="${n}" aria-label="${n}점">★</button>
        `).join('')}
      </div>
      <div class="review-form-meta">
        <span>${reviewDraftRating}점</span>
        <button type="button" class="link-reset" data-action="review-reset">초기화(0점)</button>
      </div>
      <div class="review-form-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="review-submit" data-id="${id}">평가 등록</button>
        <button type="button" class="btn btn-outline btn-sm" data-action="review-cancel">취소</button>
      </div>
    </div>`;
}

function renderBoothDetail(a) {
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

// ---------- 이벤트 핸들러 ----------

function handleToggleDetail(id) {
  expandedId = expandedId === id ? null : id;
  renderBoothList();
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

function handleReviewToggle(id) {
  reviewOpenId = reviewOpenId === String(id) ? null : String(id);
  reviewDraftRating = 0; // 열 때마다 빈 별에서 다시 시작
  renderBoothList();
}

function handleStarPick(value) {
  reviewDraftRating = value;
  renderBoothList();
}

function handleReviewReset() {
  reviewDraftRating = 0;
  renderBoothList();
}

function handleReviewCancel() {
  reviewOpenId = null;
  reviewDraftRating = 0;
  renderBoothList();
}

async function handleReviewSubmit(id) {
  hideAlert();
  try {
    const res = await submitBoothReview(id, reviewDraftRating);
    if (res && res.success) {
      renderAlert('행사 평가를 등록했어요.', 'success');
      reviewOpenId = null;
      reviewDraftRating = 0;
      await loadMyBoothList();
    } else {
      renderAlert(res?.message || '평가 등록에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

// ---------- 필터 ----------

function applyStatusFilter() {
  myApplications = statusFilter
    ? allApplications.filter((a) => (a.status || 'Pending') === statusFilter)
    : allApplications;
  renderBoothList();
}

function handleFilterChange() {
  statusFilter = document.getElementById('status-filter')?.value || '';
  expandedId = null;
  reviewOpenId = null;
  reviewDraftRating = 0;
  applyStatusFilter();
}

// ---------- 초기 로드 ----------

async function loadMyBoothList() {
  const wrap = document.getElementById('booth-list');
  if (!wrap) return;

  try {
    const res = await getMyBoothList();
    if (res && res.success) {
      allApplications = res.data || [];
      applyStatusFilter();
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
  document.getElementById('status-filter')?.addEventListener('change', handleFilterChange);
  loadMyBoothList();
});
