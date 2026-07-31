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
// 수정
async function submitBoothReview(applicationId, rating, comment) {
  return callApi('/reviews', {
    method: 'POST',
    body: { applicationId: Number(applicationId), rating, comment },
  });
}
async function requestRefund(applicationId, reason) {
  return callApi('/payments/request-refund', {
    method: 'POST',
    body: { applicationId, reason },
  });
}

// ---------- 화면 피드백 유틸 ----------

function renderAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('alert-error', 'alert-success');
  box.classList.add(
    type === 'success' ? 'alert-success' : 'alert-error',
    'show',
  );
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.classList.remove('show');
}

const STATUS_LABEL = {
  Pending: '대기중',
  Approved: '승인됨',
  Rejected: '반려됨',
  Paid: '결제됨',
  Refunded: '결제 취소',
  RefundRequested: '환불 요청'
};
const STATUS_CLASS = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
  Paid: 'paid',
  Refunded: 'refunded',
  RefundRequested: 'RefundRequested'
};

// ---------- 상태 ----------

let allApplications = [];
let myApplications = [];
let statusFilter = '';
let expandedId = null; // 상세정보가 펼쳐진 신청 id
let reviewOpenId = null; // 별점 입력창이 펼쳐진 신청 id (문자열로 비교)
let reviewDraftRating = 0; // 별점 입력창에서 아직 제출 전인 값 (0~5)
// [수정] 검색 키워드. search.js 가 window.setMyBoothSearchKeyword() 로 넘겨줍니다.
// (페이지네이션으로 한 페이지에 5건만 DOM에 있다 보니, 다른 페이지의 신청 내역은
//  기존 방식(화면에 그려진 카드만 텍스트 검색)으로는 못 찾았습니다.)
let searchKeyword = '';

// ---------- 페이지네이션 ----------
const PAGE_SIZE = 5;
let currentPage = 1;

// ---------- 렌더링 ----------

function renderBoothList() {
  const wrap = document.getElementById('booth-list');
  const emptyState = document.getElementById('empty-state');
  const countEl = document.getElementById('result-count');
  if (!wrap) return;

  if (countEl) {
    countEl.textContent =
      allApplications.length === 0 ? '' : `${myApplications.length}건`;
  }

  if (!myApplications || myApplications.length === 0) {
    wrap.innerHTML = '';
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.textContent =
        allApplications.length === 0
          ? '아직 신청한 부스가 없어요.'
          : searchKeyword
            ? `'${searchKeyword}'에 대한 검색 결과가 없어요.`
            : '해당 상태의 신청이 없어요.';
    }
    renderPagination(0);
    return;
  }
  if (emptyState) emptyState.hidden = true;

  const totalPages = Math.max(1, Math.ceil(myApplications.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = myApplications.slice(start, start + PAGE_SIZE);

  wrap.innerHTML = pageItems.map((a) => renderBoothCard(a)).join('');
  renderPagination(totalPages);

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
    btn.addEventListener('click', () =>
      handleStarPick(Number(btn.dataset.value)),
    );
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

// 현재 페이지 기준으로 보여줄 페이지 번호 목록을 만듦 (main.js와 동일한 축약 규칙)
function getPageWindow(current, total) {
  const SIBLINGS = 2;
  const first = 1;
  const last = total;

  if (total <= SIBLINGS * 2 + 3) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const start = Math.max(current - SIBLINGS, first);
  const end = Math.min(current + SIBLINGS, last);
  const pages = [];

  pages.push(first);
  if (start > first + 1) pages.push('…');
  else if (start === first + 1) pages.push(first + 1);

  for (let p = start; p <= end; p++) {
    if (p !== first && p !== last) pages.push(p);
  }

  if (end < last - 1) pages.push('…');
  else if (end === last - 1) pages.push(last - 1);

  pages.push(last);

  return pages.filter((p, i) => p === '…' || pages.indexOf(p) === i);
}

function renderPagination(totalPages) {
  const nav = document.getElementById('pagination');
  if (!nav) return;
  if (totalPages <= 1) { nav.innerHTML = ''; return; }

  const buttons = [];
  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`
  );

  getPageWindow(currentPage, totalPages).forEach((p) => {
    if (p === '…') {
      buttons.push(`<span class="page-ellipsis">…</span>`);
    } else {
      buttons.push(
        `<button type="button" class="page-btn${p === currentPage ? ' is-active' : ''}" data-page="${p}">${p}</button>`
      );
    }
  });

  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`
  );
  nav.innerHTML = buttons.join('');
}

function handlePaginationClick() {
  const nav = document.getElementById('pagination');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.page-btn');
    if (!btn || btn.disabled) return;
    const page = Number(btn.dataset.page);
    if (!page || page === currentPage) return;
    currentPage = page;
    renderBoothList();
    document.getElementById('booth-list-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function renderBoothCard(a) {
  const id = a.applicationId;
  const status = a.status || 'Pending';
  const refundAmount = a.refundAmount;
  const isPending = status === 'Pending';
  const isApproved = status === 'Approved' || status === 'Paid';
  const isExpanded = expandedId === String(id) || expandedId === id;
  return `
    <div class="item-card" data-application-id="${id}">
      <div class="item-card-top">
        <div data-action="toggle" data-id="${id}" style="cursor:pointer;">
          <div class="item-card-title">${a.marketTitle || '마켓 정보 없음'} · ${a.boothNumber}번 부스${a.title ? ` · ${a.title}` : ''}</div>
          <div class="item-card-meta">${a.itemName || '이름 미입력'}</div>
          <!-- [추가] 이 부스를 신청한 마켓의 주최자 -->
          <div class="item-card-meta">주최자: ${ProfileLink.html(a.hostId, a.hostNickname)}</div>
        </div>
        <span class="status-tag ${STATUS_CLASS[status] || 'pending'}">${STATUS_LABEL[status] || status}</span>
      </div>

    <div class="item-card-actions">
      <div class="action-group">
        <a class="btn btn-outline btn-sm" href="${isPending ? `booth-edit?applicationId=${id}` : '#'}" ${isPending ? '' : 'aria-disabled="true" tabindex="-1" title="대기중인 신청만 수정할 수 있어요." onclick="return false;"'}>수정</a>
        <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${id}" ${isPending ? '' : 'disabled title="대기중인 신청만 취소할 수 있어요."'}>삭제</button>
        ${status === 'Approved'
      ? renderPaymentArea(a)
      : ''
    }
    ${(status === 'Approved' || status === 'Paid') ? renderReviewTrigger(a) : ''}
    </div>
    ${status === 'Paid'
      ? `
    <span class="payment-area">
      <button type="button" class="btn btn-sage btn-sm" data-action="refunded"
      onclick="requestRefund_btn(${id}, '${status}',${refundAmount})" id = "refunded_btn">환불 요청</button>
    </span>
<div id="inputContainer" class="refund-policy-box" style="display: none;">
  <div class="refund-policy-title">환불 규정</div>

  <div class="refund-policy-table">
    <div class="refund-policy-row refund-policy-header">
      <span>내용</span>
      <span>환불 범위</span>
    </div>
    <div class="refund-policy-row">
      <span>개최 7일 전까지 결제 취소</span>
      <span class="refund-rate full">
      <span>
      예상 환불 금액 ${a.boothPrice} |
      </span>
      100%
      </span>
    </div>
    <div class="refund-policy-row">
      <span>개최 5일 전까지 결제 취소</span>
      <span class="refund-rate half">
      <span>
      예상 환불 금액 ${a.boothPrice * 0.5} |
      </span>
      50%
      </span>
    </div>
    <div class="refund-policy-row">
      <span>개최 3일 전까지 결제 취소</span>
      <span class="refund-rate none">
      <span>
      환불 불가 |
      </span>
      0%
      </span>
    </div>
  </div>

  <div class="refund-confirm-row">
    <label class="refund-checkbox-label">
      <span>동의하십니까?</span>
      <input type="checkbox" id="myCheckbox" />
    </label>
    <input type="text" id="userInput" class="form-input refund-input" placeholder="취소 내용을 입력하세요" />
    <button type="button" class="btn btn-sage btn-sm" data-action="refunded"
      onclick="requestRefund_(${id}, '${status}')">
      입력 확인
    </button>
  </div>
</div>
      `
      :
      ''
    }
    </div>

      ${(status === 'Approved' || status === 'Paid') && reviewOpenId === String(id) ? renderReviewForm(id) : ''}
      ${isExpanded ? renderBoothDetail(a) : ''}
    </div>`;
}

// 결제 기한 문자열을 안전하게 Date로 파싱 (없거나 형식이 이상하면 null)
function parsePaymentDue(paymentDueAt) {
  if (!paymentDueAt) return null;
  const due = new Date(String(paymentDueAt).replace(' ', 'T'));
  return isNaN(due.getTime()) ? null : due;
}

// 결제 마감이 지났는지(또는 기한 정보가 없는지) 여부
function isPaymentTimedOut(a) {
  const due = parsePaymentDue(a.paymentDueAt);
  if (!due) return true; // 기한 정보가 없으면(결제 완료 후 NULL 포함) 타임아웃으로 취급
  return due.getTime() - Date.now() <= 0;
}

// 승인된 신청의 결제 영역: 결제 완료 / 타임아웃 / 결제하기+타이머 셋 중 하나만 렌더링
function renderPaymentArea(a) {
  const id = a.applicationId;

  if (a.isPaid) {
    return `
      <span class="payment-area">
        <span class="Refunded btn-sm">결제 완료</span>
      </span>`;
  }

  if (isPaymentTimedOut(a)) {
    return `
      <span class="payment-area">
        <span class="status-tag rejected">타임아웃</span>
      </span>`;
  }

  return `
    <span class="payment-area">
      <a class="btn btn-danger btn-sm" href="payment?applicationId=${id}&amount=${a.boothPrice}&orderName=${a.marketTitle + '부스료'}">
      결제하기
      </a>
      <span class="payment-timer" data-due="${a.paymentDueAt}"></span>
    </span>`;
}

function updateTimers() {
  document.querySelectorAll('.payment-timer').forEach((timer) => {
    const due = parsePaymentDue(timer.dataset.due);

    // due가 없거나(NULL) 파싱 불가능한 값이면 NaN:NaN 대신 타임아웃으로 표시
    if (!due) {
      timer.textContent = '타임아웃';
      return;
    }

    const diff = due.getTime() - Date.now();

    if (diff <= 0) {
      timer.textContent = '타임아웃';
      return;
    }

    const totalMinutes = Math.floor(diff / 1000 / 60);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    timer.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });
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
  const isPaid = !!a.isPaid;

  if (hasReview) {
    return `
      <span class="review-summary">
        <span class="review-label">내 평가</span>
        ${renderStaticStars(a.myRating)}
        <span class="review-score">${a.myRating}점</span>
      </span>`;
  }

  const canReview = isPaid && eventEnded;
  let disabledTitle = '';
  if (!isPaid) disabledTitle = '결제가 완료되어야 평가할 수 있어요.';
  else if (!eventEnded) disabledTitle = '행사가 시작된 뒤에 평가할 수 있어요.';

  return `
    <button type="button" class="btn btn-outline btn-sm" data-action="review-toggle" data-id="${id}"
      ${canReview ? '' : `disabled title="${disabledTitle}"`}>
      행사 평가하기
    </button>`;
}

function renderReviewForm(id) {
  return `
    <div class="review-form">
      <div class="star-picker">
        ${[1, 2, 3, 4, 5]
      .map(
        (n) => `
          <button type="button" class="star-btn ${n <= reviewDraftRating ? 'filled' : ''}" data-action="star-pick" data-value="${n}" aria-label="${n}점">★</button>
        `,
      )
      .join('')}
      </div>
      <div class="review-form-meta">
        <span>${reviewDraftRating}점</span>
        <button type="button" class="link-reset" data-action="review-reset">초기화(0점)</button>
      </div>
      <textarea id="review-comment-input" class="review-comment-input" maxlength="200"
        placeholder="한줄평을 남겨주세요 (선택)"></textarea>
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
    ? a.itemImage.startsWith('http')
      ? a.itemImage
      : `${API_BASE_URL}${a.itemImage}`
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
  const confirmed = window.confirm(
    '이 부스 신청을 취소할까요? 취소 후에는 되돌릴 수 없어요.',
  );
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

  const confirmed = window.confirm('평가를 등록하면 변경할 수 없습니다. 등록하시겠어요?');
  if (!confirmed) return;

  const commentValue = document.getElementById('review-comment-input')?.value.trim() || undefined;

  try {
    const res = await submitBoothReview(id, reviewDraftRating, commentValue);
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
function requestRefund_btn(a_id, a_status, p_refundAmount) {
  const inputContainer = document.getElementById('inputContainer');
  const btnText = document.getElementById('refunded_btn');
  if (inputContainer.style.display === 'none') {
    btnText.textContent  = '환불 요청 취소';
    inputContainer.style.display = 'block'
  }
  else {
    btnText.textContent  = '환불 요청';
    inputContainer.style.display = 'none'
  }
}
// 결제 환불 요청
async function requestRefund_(a_id, a_status) {
  const checkbox = document.getElementById('myCheckbox');
  const inputContainer = document.getElementById('inputContainer');
  if (!checkbox.checked) {
    alert('약관에 동의하셔야 요청을 보낼 수 있습니다.');
    return;
  }
  if (a_status != 'Paid')
    return;
  try {
    const data = await requestRefund(a_id, '환불 요청')
    if (data && data.success) {
      renderAlert('환불 요청이 접수 되었습니다.', 'success')
      await loadMyBoothList();
    }
    else {
      renderAlert(data.message);
    }
  }
  catch (err) {
    renderAlert("서버에 연결할 수 없어요 잠시 후 다시 시도해주세요.");
  }
  inputContainer.style.display = 'none'
  renderBoothList();
}

// ---------- 필터 ----------

// 검색 키워드가 신청 내역 하나와 맞는지 확인 (마켓명/부스번호/상품명/주최자명을 훑음)
function matchesSearchKeyword(a) {
  if (!searchKeyword) return true;
  const haystack = [a.marketTitle, a.title, a.itemName, a.hostNickname, a.boothNumber]
    .filter((v) => v !== undefined && v !== null)
    .join(' ')
    .toLowerCase();
  return haystack.includes(searchKeyword);
}

function applyStatusFilter() {
  const byStatus = statusFilter
    ? allApplications.filter((a) => (a.status || 'Pending') === statusFilter)
    : allApplications;
  myApplications = byStatus.filter(matchesSearchKeyword);
  renderBoothList();
}

function handleFilterChange() {
  statusFilter = document.getElementById('status-filter')?.value || '';
  expandedId = null;
  reviewOpenId = null;
  reviewDraftRating = 0;
  currentPage = 1;
  applyStatusFilter();
}

// [수정] search.js 의 실시간 검색창이 호출하는 훅.
// allApplications(서버에서 받은 전체 목록) 기준으로 다시 필터링하므로,
// 지금 화면에 없는(다른 페이지의) 신청 내역도 검색됩니다.
window.setMyBoothSearchKeyword = function (keyword) {
  searchKeyword = (keyword || '').trim().toLowerCase();
  expandedId = null;
  reviewOpenId = null;
  reviewDraftRating = 0;
  currentPage = 1;
  applyStatusFilter();
};

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
      wrap.innerHTML =
        '<p class="list-empty">부스 목록을 불러오지 못했어요.</p>';
    }
  } catch (err) {
    wrap.innerHTML = '<p class="list-empty">서버에 연결할 수 없어요.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isLoggedIn = !!sessionStorage.getItem('loggedInUser');
  setInterval(updateTimers, 1000);
  if (!isLoggedIn) {
    window.location.href = '../A_auth-main/login.html';
    return;
  }
  document
    .getElementById('status-filter')
    ?.addEventListener('change', handleFilterChange);
  handlePaginationClick();
  loadMyBoothList();
});
