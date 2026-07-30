// 담당 B: 주최측/판매자 화면 프론트 로직
// 함수명은 docs/naming-convention.md 규칙(동사 시작 + camelCase)을 따릅니다.

// ---------- API 호출 (docs/api-routes.md 계약 그대로 사용) ----------

async function createMarket(payload) {
  return callApi('/markets', { method: 'POST', body: payload });
}

async function getMarketDetail(marketId) {
  return callApi(`/markets/${marketId}`);
}

async function updateMarketStatus(marketId, payload) {
  // payload 예: { isExpired: true } - 마켓 마감 처리 등
  return callApi(`/markets/${marketId}`, { method: 'PATCH', body: payload });
}

async function getApplicationList(marketId) {
  return callApi(`/markets/${marketId}/applications`);
}

async function approveSellerApplication(applicationId) {
  return callApi(`/applications/${applicationId}/approve`, { method: 'PATCH' });
}

async function rejectSellerApplication(applicationId) {
  return callApi(`/applications/${applicationId}/reject`, { method: 'PATCH' });
}

async function applyForBooth(payload) {
  // payload: { marketId, boothNumber, itemName, productDesc }
  return callApi('/applications', { method: 'POST', body: payload });
}

async function submitSellerReview(applicationId, rating, comment) {
  return callApi('/reviews/seller', {
    method: 'POST',
    body: { applicationId: Number(applicationId), rating, comment },
  });
}

async function createComment(payload) {
  // payload: { targetType, targetId, content, parentId?, visibility? }
  //   visibility: 'public' | 'host_only'(주최자 외 비공개) | 'seller_only'(판매자 외 비공개)
  return callApi('/comments', { method: 'POST', body: payload });
}

async function getCommentList(targetType, targetId) {
  // 로그인 토큰이 있으면 본인/주최자에게 허용된 비공개 댓글도 함께 내려옵니다.
  return callApi(`/comments?targetType=${targetType}&targetId=${targetId}`);
}

async function deleteCommentApi(commentId) {
  return callApi(`/comments/${commentId}`, { method: 'DELETE' });
}

async function updateCommentApi(commentId, content) {
  return callApi(`/comments/${commentId}`, { method: 'PATCH', body: { content } });
}

async function refundPayment(applicationId, reason) {
  return callApi('/payments/refund', {
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

function getMarketIdFromUrl() {
  return new URLSearchParams(window.location.search).get('marketId');
}

function formatPrice(price) {
  const n = Number(price);
  return !n ? '무료 참가' : `참가비 ${n.toLocaleString()}원`;
}

const STATUS_LABEL = { Pending: '대기중', Approved: '승인됨', Rejected: '반려됨', Paid: '결제 완료', Refunded: '결제 취소', RefundRequested: '환불 신청' };
const STATUS_CLASS = { Pending: 'pending', Approved: 'approved', Rejected: 'rejected', Paid: 'paid', Refunded: 'refunded', RefundRequested: 'refundRequested' };

let currentApplications = [];
let sellerReviewOpenId = null;
let sellerReviewDraftRating = 0;
let selectedApplicationIds = new Set();

// ---------- 마켓 등록 ----------

function handleMarketCreateSubmit() {
  console.log('등록 시작');
  const form = document.getElementById('market-create-form');
  if (!form) return;
  console.log('등록 중');
  const submitBtn = document.getElementById('market-create-submit-btn');

  form.addEventListener('submit', async (e) => {
    console.log('마켓 등록 폼 제출 이벤트 발생');
    e.preventDefault();
    hideAlert();

    // ---- 1) 원본 입력값 먼저 읽기 (검증은 가공 전 원본 문자열로) ----
    const titleVal = document.getElementById('title').value.trim();
    const startEventDateVal = document.getElementById('start-event-date').value;
    const endEventDateVal = document.getElementById('end-event-date').value;
    const startRecruitmentDateVal = document.getElementById('recruitmentDate_min').value;
    const endRecruitmentDateVal = document.getElementById('recruitmentDate_max').value;
    const boothPriceRaw = document.getElementById('booth-price').value;
    const maxParticipantsRaw = document.getElementById('max-participants').value;
    const fullAddressVal = document.getElementById('fullAddress').value.trim();

    // ---- 2) 필수값 + 형식 + 범위 + 논리 검증을 이미지 업로드보다 먼저 수행 ----
    if (!titleVal) {
      renderAlert('마켓 이름을 입력해주세요.');
      return;
    }
    if (!startEventDateVal || !endEventDateVal) {
      renderAlert('개최 일자를 모두 입력해주세요.');
      return;
    }
    if (!startRecruitmentDateVal || !endRecruitmentDateVal) {
      renderAlert('개최 일자를 모두 입력해주세요.');
      return;
    }
    if (new Date(endEventDateVal) < new Date(startEventDateVal)) {
      renderAlert('종료일은 시작일보다 빠를 수 없어요.');
      return;
    }
    if (new Date(endEventDateVal) < new Date(startRecruitmentDateVal)) {
      renderAlert('모집 기간은 개최기간보다 빠를 수 없어요.');
      return;
    }
    if (!fullAddressVal) {
      renderAlert('개최 장소 주소를 검색해서 선택해주세요.');
      return;
    }
    const boothPriceNum = Number(boothPriceRaw);
    if (boothPriceRaw === '' || Number.isNaN(boothPriceNum) || boothPriceNum < 0) {
      renderAlert('부스료는 0 이상의 숫자로 입력해주세요.');
      return;
    }
    const maxParticipantsNum = Number(maxParticipantsRaw);
    if (maxParticipantsRaw === '' || !Number.isInteger(maxParticipantsNum) || maxParticipantsNum < 0) {
      renderAlert('허용 가능한 최대 부스 수는 0 이상의 정수로 입력해주세요.');
      return;
    }

    // ---- 3) 검증 통과 후에만 이미지 업로드 진행 ----
    await uploadMarketImage();

    const payload = {
      title: titleVal,
      eventDate_min: startEventDateVal,
      eventDate_max: endEventDateVal,
      recruitmentDate_min: startRecruitmentDateVal,
      recruitmentDate_max: endRecruitmentDateVal,
      boothPrice: boothPriceNum,
      description: document.getElementById('description').value.trim(),
      locationName: fullAddressVal,
      region: document.getElementById('region').value || null,
      latitude: document.getElementById('latitude').value || null,
      longitude: document.getElementById('longitude').value || null,
      maxparticipants: maxParticipantsNum,
      marketImage: document.getElementById('uploadedImagePath').value || null,
    };

    console.log('마켓 등록 payload:', payload);

    setButtonLoading(submitBtn, true, '등록 중...', '등록하기');
    try {
      const res = await createMarket(payload);
      if (res && res.success) {
        renderAlert('마켓이 등록됐어요!', 'success');
        setTimeout(() => {
          window.location.href = '../../index.html';
        }, 1000);
      } else {
        renderAlert(res?.message || '등록에 실패했어요. 입력값을 확인해주세요.');
        setButtonLoading(submitBtn, false, '등록 중...', '등록하기');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      setButtonLoading(submitBtn, false, '등록 중...', '등록하기');
    }
  });
}
async function uploadMarketImage() {
  console.log('Image upload button clicked');
  const fileInput = document.getElementById('market-image');
  const file = fileInput.files[0];

  if (!file) {
    console.log('No file selected');
  }

  const formData = new FormData();
  formData.append('marketImage', file);

  try {
    const response = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (data.success) {
      document.getElementById('uploadedImagePath').value = data.filePath;
      console.log('Image uploaded successfully:', data.filePath);
    }
    else {
      console.error('Image upload failed:', data.message);
    }
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}
function initDateInputs() {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      e.preventDefault();
    });
    input.addEventListener('click', (e) => {
      if (input.showPicker) {
        input.showPicker();
      }
    });
  })
}
// async function createMarketWithImage(formData) {
//   const token = sessionStorage.getItem('token');

//   const res = await fetch(`http://localhost:5000/api/markets`, {
//     method: 'POST',
//     headers: {
//       'Authorization': `Bearer ${token}`
//     },
//     body: formData, // JSON.stringify 하지 않고 그대로 전달
//   });

//   return res.json();
// }

// ---------- 마켓 상세 ----------

function renderMarketDetail(market) {
  const titleEl = document.getElementById('market-title');
  const infoEl = document.getElementById('market-info');
  if (!titleEl || !infoEl) return;

  titleEl.textContent = market.title || '마켓 상세';
  infoEl.textContent = [market.eventDate, market.locationName, formatPrice(market.boothPrice)]
    .filter(Boolean)
    .join(' · ');

  // [추가] 주최자 닉네임 + 「프로필 보기」 버튼.
  //        판매자가 이 마켓을 누가 여는지 확인하고 프로필로 넘어갈 수 있는 유일한 진입점입니다.
  const hostEl = document.getElementById('market-host');
  if (hostEl && market.hostId) {
    // 닉네임 자체가 링크입니다. (별도 「프로필 보기」 버튼은 두지 않습니다)
    hostEl.innerHTML = '주최자 ' + ProfileLink.html(market.hostId, market.hostNickname);
    hostEl.style.display = '';
  }
}

async function loadMarketDetail() {
  const titleEl = document.getElementById('market-title');
  if (!titleEl) return;

  const marketId = getMarketIdFromUrl();
  if (!marketId) {
    titleEl.textContent = '마켓 정보를 찾을 수 없어요';
    return;
  }

  try {
    const res = await getMarketDetail(marketId);
    if (res && res.success && res.data) {
      renderMarketDetail(res.data);
    } else {
      titleEl.textContent = '마켓 정보를 불러오지 못했어요';
    }
  } catch (err) {
    titleEl.textContent = '서버에 연결할 수 없어요';
  }
}

function handleBoothSelectClick() {
  const btn = document.getElementById('booth-apply-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const marketId = getMarketIdFromUrl();
    window.location.href = `booth-apply?marketId=${marketId}`;
  });
}

// ---------- 신청자 목록 (주최측 전용) ----------

function renderApplicationList(applications) {
  currentApplications = applications || [];
  const wrap = document.getElementById('application-list');
  if (!wrap) return;

  if (currentApplications.length === 0) {
    wrap.innerHTML = '<p class="list-empty">아직 들어온 신청이 없어요.</p>';
    return;
  }

  wrap.innerHTML = currentApplications
    .map((a) => {
      const status = a.status || 'Pending';
      const id = a.applicationId;
      const canShowReview = status === 'Paid'; // 결제 완료된 건만 평가 대상
      const canSelect = status === 'Pending' || status === 'Paid'; // 승인/반려/환불 대상만 선택 가능
      return `
      <div class="item-card" data-application-id="${id}">
    <div class="item-card-top">
      <div style="display:flex; align-items:flex-start; gap:8px;">
        ${canSelect ? `
          <input type="checkbox" class="application-select-checkbox" data-id="${id}"
            ${selectedApplicationIds.has(String(id)) ? 'checked' : ''} style="margin-top:3px;" />
        ` : '<span style="width:16px; display:inline-block;"></span>'}
        <div>
          <div class="item-card-title">${a.itemName || '이름 미입력'} · ${a.boothNumber}번 부스${a.title ? ` · ${a.title}` : ''}</div>
          <div class="item-card-meta">신청자: ${ProfileLink.html(a.sellerId, a.sellerNickname)}</div>
        </div>
      </div>
      <span class="status-tag ${STATUS_CLASS[status] || 'pending'}">${STATUS_LABEL[status] || status}</span>
    </div>
        ${status === 'Pending' ? `
        <div class="item-card-actions">
          <button type="button" class="btn btn-sage btn-sm" data-action="approve" data-id="${id}">승인</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="reject" data-id="${id}">반려</button>
        </div>` : ''}
        ${status === 'Paid' ? `
        <div class="item-card-actions">
          <button type="button" class="btn btn-sage btn-sm" data-action="refunded_onBtn">
           결제 취소
          </button>
         </div>
         <div id="inputContainer" style="display: none; margin-top: 10px;">
            <input type="text" id="userInput" placeholder="취소 내용을 입력하세요 (*주최자가 직접 취소 시 100% 환불이 적용됩니다.)">
            <button type="button" class="btn btn-sage btn-sm" data-action="refunded" data-id="${a.applicationId}">
            입력 확인
            </button>
         </div>
        ` : ''}
        ${status === `RefundRequested` ? `
          <div class="item-card-actions">
          <button type="button" class="btn btn-sage btn-sm" data-action="refundRequested" data-id="${a.applicationId}">
            환불 승인
          </button>
         </div>
          `: ''}
        ${canShowReview ? renderSellerReviewTrigger(a) : ''}
        ${canShowReview && sellerReviewOpenId === String(id) ? renderSellerReviewForm(id) : ''}
      </div>`;
    })
    .join('');

  wrap.querySelectorAll('[data-action="approve"]').forEach((btn) => {
    btn.addEventListener('click', () => handleApplicationDecision(btn.dataset.id, 'approve'));
  });
  wrap.querySelectorAll('[data-action="reject"]').forEach((btn) => {
    btn.addEventListener('click', () => handleApplicationDecision(btn.dataset.id, 'reject'));
  });
  wrap.querySelectorAll('[data-action="seller-review-toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSellerReviewToggle(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="seller-star-pick"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSellerStarPick(Number(btn.dataset.value)));
  });
  wrap.querySelectorAll('[data-action="seller-review-reset"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSellerReviewReset());
  });
  wrap.querySelectorAll('[data-action="seller-review-submit"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSellerReviewSubmit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="seller-review-cancel"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSellerReviewCancel());
  });
  wrap.querySelectorAll('[data-action="refunded_onBtn"]').forEach((btn) => {
    btn.addEventListener('click', () => refundMemoBtn());
  });
  wrap.querySelectorAll('[data-action="refunded"]').forEach((btn) => {
    btn.addEventListener('click', () => refundPayment_(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="refundRequested"]').forEach((btn) => {
    btn.addEventListener('click', () => refundPayment_seller(btn.dataset.id,));
  });
  wrap.querySelectorAll('.application-select-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedApplicationIds.add(id);
      else selectedApplicationIds.delete(id);
      renderBulkToolbar();
    });
  });

  renderBulkToolbar();
}
function renderBulkToolbar() {
  const el = document.getElementById('bulk-actions-toolbar');
  if (!el) return;

  const count = selectedApplicationIds.size;

  el.innerHTML = `
    <div class="bulk-toolbar">
    <label class="bulk-select-all">
        <input type="checkbox" id="select-all-checkbox" />
        <span>전체 선택</span>
      </label>
      <span class="bulk-count">${count}건 선택됨</span>
      <div class="bulk-actions">
        <button type="button" class="btn btn-sage btn-sm" id="bulk-approve-btn" ${count === 0 ? 'disabled' : ''}>일괄 승인</button>
        <button type="button" class="btn btn-danger btn-sm" id="bulk-reject-btn" ${count === 0 ? 'disabled' : ''}>일괄 반려</button>
        <button type="button" class="btn btn-outline btn-sm" id="bulk-refund-btn" ${count === 0 ? 'disabled' : ''}>일괄 결제취소</button>
      </div>
    </div>`;

  document.getElementById('select-all-checkbox')?.addEventListener('change', (e) => {
    handleSelectAll(e.target.checked);
  });
  document.getElementById('bulk-approve-btn')?.addEventListener('click', () => handleBulkAction('approve'));
  document.getElementById('bulk-reject-btn')?.addEventListener('click', () => handleBulkAction('reject'));
  document.getElementById('bulk-refund-btn')?.addEventListener('click', () => handleBulkAction('refund'));
}
function handleSelectAll(checked) {
  document.querySelectorAll('.application-select-checkbox').forEach((cb) => {
    cb.checked = checked;
    const id = cb.dataset.id;
    if (checked) selectedApplicationIds.add(id);
    else selectedApplicationIds.delete(id);
  });
  updateToolbar();
}
function updateToolbar()
{
  const count =selectedApplicationIds.size;
  document.querySelector('.bulk-count').textContent = `${count}건 선택됨`;
  const isDisabled = count === 0;
  const buttons = document.querySelectorAll('.bulk-actions button');
  buttons.forEach(btn => btn.disabled = isDisabled);
}
async function handleBulkAction(action) {
  if (selectedApplicationIds.size === 0) return;
  const ids = Array.from(selectedApplicationIds);

  const confirmMsgMap = {
    approve: `선택한 ${ids.length}건을 일괄 승인하시겠습니까?`,
    reject: `선택한 ${ids.length}건을 일괄 반려하시겠습니까?`,
    refund: `선택한 ${ids.length}건을 일괄 결제취소(환불) 처리하시겠습니까?`,
  };
  if (!confirm(confirmMsgMap[action])) return;

  let reason = '';
  if (action === 'refund') {
    reason = prompt('환불 사유를 입력해주세요.', '주최자 요청에 의한 일괄 환불') || '';
    if (!reason.trim()) {
      renderAlert('환불 사유를 입력해야 합니다.');
      return;
    }
  }

  hideAlert();

  // 각 id마다 상태를 확인해서, 맞는 상태일 때만 실제 API 호출 (섞여 있어도 안전하게 처리)
  const results = await Promise.allSettled(
    ids.map((id) => {
      const app = currentApplications.find((a) => String(a.applicationId) === String(id));
      if (!app) return Promise.resolve({ success: false, message: '데이터 없음' });

      if (action === 'approve') {
        if (app.status !== 'Pending') return Promise.resolve({ success: false, message: '대기중 상태가 아님' });
        return approveSellerApplication(id);
      }
      if (action === 'reject') {
        if (app.status !== 'Pending') return Promise.resolve({ success: false, message: '대기중 상태가 아님' });
        return rejectSellerApplication(id);
      }
      if (action === 'refund') {
        if (app.status !== 'Paid') return Promise.resolve({ success: false, message: '결제완료 상태가 아님' });
        return refundPayment(id, reason);
      }
    })
  );

  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value?.success).length;
  const failCount = ids.length - successCount;

  selectedApplicationIds.clear();

  if (failCount === 0) {
    renderAlert(`${successCount}건 처리 완료했어요.`, 'success');
  } else {
    renderAlert(
      `${successCount}건 처리 완료, ${failCount}건은 상태가 맞지 않아 처리되지 않았어요.`,
      successCount > 0 ? 'success' : 'error'
    );
  }

  await loadApplicationList(); // 목록 새로고침 (선택 상태도 자연스럽게 초기화됨)
}

function renderStaticStars(rating) {
  return `<span class="stars-static" aria-label="${rating}점">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
}

function renderSellerReviewTrigger(a) {
  const id = a.applicationId;
  const hasReview = a.mySellerRating !== null && a.mySellerRating !== undefined;

  if (hasReview) {
    return `
      <span class="review-summary">
        <span class="review-label">내 평가</span>
        ${renderStaticStars(a.mySellerRating)}
        <span class="review-score">${a.mySellerRating}점</span>
      </span>`;
  }

  const eventStarted = !!a.eventStarted;
  return `
    <div class="item-card-actions">
      <button type="button" class="btn btn-outline btn-sm" data-action="seller-review-toggle" data-id="${id}"
        ${eventStarted ? '' : `disabled title="행사가 시작된 뒤에 평가할 수 있어요."`}>
        판매자 평가하기
      </button>
    </div>`;
}

function renderSellerReviewForm(id) {
  return `
    <div class="review-form">
      <div class="star-picker">
        ${[1, 2, 3, 4, 5]
      .map((n) => `<button type="button" class="star-btn ${n <= sellerReviewDraftRating ? 'filled' : ''}" data-action="seller-star-pick" data-value="${n}" aria-label="${n}점">★</button>`)
      .join('')}
      </div>
      <div class="review-form-meta">
        <span>${sellerReviewDraftRating}점</span>
        <button type="button" class="link-reset" data-action="seller-review-reset">초기화(0점)</button>
      </div>
      <textarea id="seller-review-comment-input" class="review-comment-input" maxlength="200"
        placeholder="한줄평을 남겨주세요 (선택)"></textarea>
      <div class="review-form-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="seller-review-submit" data-id="${id}">평가 등록</button>
        <button type="button" class="btn btn-outline btn-sm" data-action="seller-review-cancel">취소</button>
      </div>
    </div>`;
}

function handleSellerReviewToggle(id) {
  sellerReviewOpenId = sellerReviewOpenId === String(id) ? null : String(id);
  sellerReviewDraftRating = 0;
  renderApplicationList(currentApplications);
}
function handleSellerStarPick(value) {
  sellerReviewDraftRating = value;
  renderApplicationList(currentApplications);
}
function handleSellerReviewReset() {
  sellerReviewDraftRating = 0;
  renderApplicationList(currentApplications);
}
function handleSellerReviewCancel() {
  sellerReviewOpenId = null;
  sellerReviewDraftRating = 0;
  renderApplicationList(currentApplications);
}

async function handleSellerReviewSubmit(id) {
  hideAlert();
  const confirmed = window.confirm('평가를 등록하면 변경할 수 없습니다. 등록하시겠어요?');
  if (!confirmed) return;

  const commentValue = document.getElementById('seller-review-comment-input')?.value.trim() || undefined;

  try {
    const res = await submitSellerReview(id, sellerReviewDraftRating, commentValue);
    if (res && res.success) {
      renderAlert('판매자 평가를 등록했어요.', 'success');
      sellerReviewOpenId = null;
      sellerReviewDraftRating = 0;
      await loadApplicationList();
    } else {
      renderAlert(res?.message || '평가 등록에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

function renderStaticStars(rating) {
  return `<span class="stars-static" aria-label="${rating}점">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
}

function renderSellerReviewTrigger(a) {
  const id = a.applicationId;
  const hasReview = a.mySellerRating !== null && a.mySellerRating !== undefined;

  if (hasReview) {
    return `
      <span class="review-summary">
        <span class="review-label">내 평가</span>
        ${renderStaticStars(a.mySellerRating)}
        <span class="review-score">${a.mySellerRating}점</span>
      </span>`;
  }

  const isPaid = !!a.isPaid;
  const eventStarted = !!a.eventStarted;
  const canReview = isPaid && eventStarted;
  let disabledTitle = '';
  if (!isPaid) disabledTitle = '결제가 완료되어야 평가할 수 있어요.';
  else if (!eventStarted) disabledTitle = '행사가 시작된 뒤에 평가할 수 있어요.';

  return `
    <div class="item-card-actions">
      <button type="button" class="btn btn-outline btn-sm" data-action="seller-review-toggle" data-id="${id}"
        ${canReview ? '' : `disabled title="${disabledTitle}"`}>
        판매자 평가하기
      </button>
    </div>`;
}

function renderSellerReviewForm(id) {
  return `
    <div class="review-form">
      <div class="star-picker">
        ${[1, 2, 3, 4, 5]
      .map(
        (n) => `<button type="button" class="star-btn ${n <= sellerReviewDraftRating ? 'filled' : ''}" data-action="seller-star-pick" data-value="${n}" aria-label="${n}점">★</button>`,
      )
      .join('')}
      </div>
      <div class="review-form-meta">
        <span>${sellerReviewDraftRating}점</span>
        <button type="button" class="link-reset" data-action="seller-review-reset">초기화(0점)</button>
      </div>
      <textarea id="seller-review-comment-input" class="review-comment-input" maxlength="200"
        placeholder="한줄평을 남겨주세요 (선택)"></textarea>
      <div class="review-form-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="seller-review-submit" data-id="${id}">평가 등록</button>
        <button type="button" class="btn btn-outline btn-sm" data-action="seller-review-cancel">취소</button>
      </div>
    </div>`;
}

function handleSellerReviewToggle(id) {
  sellerReviewOpenId = sellerReviewOpenId === String(id) ? null : String(id);
  sellerReviewDraftRating = 0;
  renderApplicationList(currentApplications);
}

function handleSellerStarPick(value) {
  sellerReviewDraftRating = value;
  renderApplicationList(currentApplications);
}

function handleSellerReviewReset() {
  sellerReviewDraftRating = 0;
  renderApplicationList(currentApplications);
}

function handleSellerReviewCancel() {
  sellerReviewOpenId = null;
  sellerReviewDraftRating = 0;
  renderApplicationList(currentApplications);
}

async function handleSellerReviewSubmit(id) {
  hideAlert();
  const confirmed = window.confirm('평가를 등록하면 변경할 수 없습니다. 등록하시겠어요?');
  if (!confirmed) return;

  const commentValue = document.getElementById('seller-review-comment-input')?.value.trim() || undefined;

  try {
    const res = await submitSellerReview(id, sellerReviewDraftRating, commentValue);
    if (res && res.success) {
      renderAlert('판매자 평가를 등록했어요.', 'success');
      sellerReviewOpenId = null;
      sellerReviewDraftRating = 0;
      await loadApplicationList();
    } else {
      renderAlert(res?.message || '평가 등록에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

async function handleApplicationDecision(applicationId, decision) {
  hideAlert();
  try {
    const res = decision === 'approve'
      ? await approveSellerApplication(applicationId)
      : await rejectSellerApplication(applicationId);
    if (res && res.success) {
      renderAlert(decision === 'approve' ? '신청을 승인했어요.' : '신청을 반려했어요.', 'success');
      await loadApplicationList();
    } else {
      renderAlert(res?.message || '처리에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

async function loadApplicationList() {
  const wrap = document.getElementById('application-list');
  if (!wrap) return;

  const marketId = getMarketIdFromUrl();
  try {
    const res = await getApplicationList(marketId);
    if (res && res.success) {
      renderApplicationList(res.data || []);
    } else {
      currentApplications = [];
      wrap.innerHTML = '<p class="list-empty">신청 목록을 불러오지 못했어요.</p>';
    }
  } catch (err) {
    currentApplications = [];
    wrap.innerHTML = '<p class="list-empty">서버에 연결할 수 없어요.</p>';
  }
}

function handleCloseMarketClick() {
  const btn = document.getElementById('close-market-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!confirm('이 마켓을 마감 처리할까요? 목록에서 더 이상 노출되지 않아요.')) return;
    hideAlert();
    const marketId = getMarketIdFromUrl();
    try {
      const res = await updateMarketStatus(marketId, { isExpired: true });
      if (res && res.success) {
        renderAlert('마켓을 마감 처리했어요.', 'success');
      } else {
        renderAlert(res?.message || '마감 처리에 실패했어요.');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
  });
}

// ---------- 부스 신청 ----------

function prefillBoothApplyForm() {
  const marketIdInput = document.getElementById('market-id');
  if (!marketIdInput) return;

  const params = new URLSearchParams(window.location.search);
  marketIdInput.value = params.get('marketId') || '';
  document.getElementById('booth-number').value = params.get('booth') || '';

  const sub = document.getElementById('booth-apply-sub');
  if (sub && params.get('booth')) {
    sub.textContent = `${params.get('booth')}번 부스에 어떤 물건을 판매하실 건가요?`;
  }

  const backLink = document.getElementById('back-to-market');
  if (backLink) {
    backLink.href = `market-detail?marketId=${params.get('marketId') || ''}`;
  }

  // [추가] 어떤 주최자의 마켓에 신청하는지 닉네임으로 보여주고, 클릭하면 프로필로 이동합니다.
  renderBoothApplyHost(marketIdInput.value);

  // [추가] marketId 없이 이 페이지로 들어온 경우, 폼을 다 채워도 서버에서
  // "마켓, 부스 번호, 물품명은 필수입니다"로 실패하게 되므로 미리 안내하고 제출을 막습니다.
  if (!marketIdInput.value) {
    renderAlert('잘못된 접근이에요. 마켓 상세 페이지에서 "참가 신청" 버튼을 눌러 다시 시도해주세요.');
    const submitBtn = document.getElementById('booth-apply-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
  }
}

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

async function uploadItemImage() {
  const fileInput = document.getElementById('product-image');
  const file = fileInput?.files?.[0];

  if (!file) return; // 이미지는 선택 사항이라 없으면 그냥 건너뜁니다.

  const boothTitle = document.getElementById('booth-title')?.value.trim() || '';

  const formData = new FormData();
  // ⚠️ title을 itemImage(파일)보다 먼저 append 해야 서버 multer의
  //    destination 콜백에서 req.body.title로 부스 이름 폴더를 만들 수 있어요.
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

function handleBoothApplySubmit() {
  const form = document.getElementById('booth-apply-form');
  if (!form) return;
  const submitBtn = document.getElementById('booth-apply-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const payload = {
      marketId: document.getElementById('market-id').value,
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

    setButtonLoading(submitBtn, true, '신청 중...', '신청하기');
    await uploadItemImage();
    payload.itemImage = document.getElementById('uploaded-item-image-path').value || null;

    try {
      const res = await applyForBooth(payload);

      if (res && res.success) {
        renderAlert('부스 신청이 완료됐어요!', 'success');
        setTimeout(() => {
          window.location.href = `market-detail?marketId=${payload.marketId}`;
        }, 1000);
      } else {
        renderAlert(res?.message || '신청에 실패했어요. 입력값을 확인해주세요.');
        setButtonLoading(submitBtn, false, '신청 중...', '신청하기');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      setButtonLoading(submitBtn, false, '신청 중...', '신청하기');
    }
  });
}

// ---------- 댓글 ----------
//
// [비공개 댓글] 공개범위 3종
//   public      : 전체 공개
//   host_only   : 판매자가 작성 -> "주최자만 볼 수 있는 댓글입니다."
//   seller_only : 주최자가 판매자 댓글에 답글 -> "판매자만 볼 수 있는 댓글입니다."
//
// 체크박스 노출 규칙
//   · 새 댓글  : 판매자(=주최자가 아닌 로그인 사용자)에게만 「주최자 외 비공개」 노출
//   · 답글     : 주최자 -> 판매자 댓글에만 「판매자 외 비공개」 노출
//                판매자 -> 주최자 댓글에만 「주최자 외 비공개」 노출
//   · 주최자가 "본인 댓글"에 댓글/답글을 달 때는 노출하지 않음
//   · 이미 비공개인 댓글의 답글은 부모 설정을 서버가 자동 상속하므로 체크박스 대신 안내만 표시
//
// 최종 판정은 서버(commentController.js)가 하며, 여기서는 화면 노출만 담당합니다.

const VISIBILITY_LABEL = {
  host_only: '🔒 주최자만 볼 수 있는 댓글 입니다.',
  seller_only: '🔒 판매자만 볼 수 있는 댓글 입니다.',
};

let commentMeta = { hostId: null, viewerId: null, isHost: false };
let commentById = new Map();

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 현재 로그인 사용자 id (없으면 null) */
function getCommentViewerId() {
  if (commentMeta.viewerId !== null && commentMeta.viewerId !== undefined) {
    return Number(commentMeta.viewerId);
  }
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return user ? Number(user.userId) : null;
}

/** 내가 이 마켓의 주최자인가 */
function isCommentHost() {
  return Boolean(commentMeta.isHost);
}

/**
 * 이 위치에 비공개 체크박스를 띄울지 판단합니다.
 * parent 가 null 이면 최상위 댓글 입력폼입니다.
 * 반환: null(노출 안 함) 또는 { value, label }
 */
function resolvePrivacyOption(parent) {
  const viewerId = getCommentViewerId();
  if (!viewerId) return null;                       // 비로그인은 공개 댓글만
  if (commentMeta.privacySupported === false) return null; // DB 마이그레이션 전이면 숨김
  if (commentMeta.hostId === null || commentMeta.hostId === undefined) return null;

  const isHost = isCommentHost();

  // 부모가 이미 비공개면 서버가 자동 상속 -> 선택지 없음
  if (parent && (parent.visibility || 'public') !== 'public') return null;

  if (!parent) {
    // 최상위 댓글: 주최자는 비공개 옵션 없음
    if (isHost) return null;
    return { value: 'host_only', label: '주최자 외 비공개' };
  }

  const parentUserId = Number(parent.userId);

  if (isHost) {
    // 주최자가 자기 댓글에 답글 -> 노출 안 함
    if (parentUserId === Number(commentMeta.hostId)) return null;
    return { value: 'seller_only', label: '판매자 외 비공개' };
  }

  // 판매자: 주최자 댓글에 답글일 때만
  if (parentUserId === Number(commentMeta.hostId)) {
    return { value: 'host_only', label: '주최자 외 비공개' };
  }
  return null;
}

/** 부모가 비공개일 때 답글폼에 띄우는 안내 문구 */
function resolveInheritNotice(parent) {
  if (!parent) return '';
  const v = parent.visibility || 'public';
  if (v === 'public') return '';
  const text = isCommentHost()
    ? '이 답글은 해당 판매자와 주최자에게만 보입니다.'
    : '이 답글은 주최자에게만 보입니다.';
  return `<p class="comment-privacy-inherit">🔒 ${text}</p>`;
}

function renderPrivacyCheckbox(option, idSuffix) {
  if (!option) return '';
  const id = `comment-private-${idSuffix}`;
  return `
      <label class="comment-privacy-toggle" for="${id}">
        <input type="checkbox" id="${id}" class="comment-privacy-input" data-visibility="${option.value}" />
        <span>(${option.label})</span>
      </label>`;
}

/** 입력폼(폼 엘리먼트)에서 선택된 visibility 값을 읽습니다. */
function readVisibilityFrom(formEl) {
  if (!formEl) return 'public';
  const box = formEl.querySelector('.comment-privacy-input');
  if (!box || !box.checked) return 'public';
  return box.dataset.visibility || 'public';
}

function buildCommentTree(comments) {
  const byId = new Map();
  comments.forEach((c) => byId.set(c.commentId, { ...c, replies: [] }));

  const roots = [];
  byId.forEach((c) => {
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId).replies.push(c);
    } else {
      roots.push(c);
    }
  });
  return roots;
}

function renderCommentNode(c, isReply) {
  const viewerId = getCommentViewerId();
  const visibility = c.visibility || 'public';

  // masked: 서버가 본문을 지우고 껍데기만 내려준 댓글.
  // 자리는 남기되 내용/수정삭제/답글 기능은 모두 막습니다.
  const isMasked = Boolean(c.masked);
  const isMine = !isMasked && viewerId !== null && Number(viewerId) === Number(c.userId);

  const noticeText = VISIBILITY_LABEL[visibility] || '🔒 비공개 댓글 입니다.';

  // 내가 볼 수 있는 비공개 댓글 -> 본문 위에 배지
  const badge = !isMasked && VISIBILITY_LABEL[visibility]
    ? `<div class="comment-privacy-badge comment-privacy-${visibility}">${noticeText}</div>`
    : '';

  // 볼 수 없는 댓글 -> 본문 자리에 안내 문구만
  const bodyHtml = isMasked
    ? `<div class="comment-content comment-content-masked">${noticeText}</div>`
    : `<div class="comment-content" data-content-for="${c.commentId}">${c.content ?? ''}</div>`;

  const classNames = [
    'comment-item',
    isReply ? 'comment-item-reply' : '',
    visibility !== 'public' ? 'comment-item-private' : '',
    isMasked ? 'comment-item-masked' : '',
  ].filter(Boolean).join(' ');

  return `
    <div class="${classNames}" data-comment-id="${c.commentId}">
      <div class="comment-item-top">
        <!-- [추가] 댓글 작성자 닉네임을 눌러 프로필로 이동 (주최자 문의 답변 확인용) -->
        <div class="comment-nickname">${isMasked
          ? ProfileLink.escapeHtml(c.nickname || '알 수 없음')
          : ProfileLink.html(c.userId, c.nickname)}</div>
        ${isMine ? `
          <div class="comment-item-actions">
            <button type="button" class="comment-edit-btn" data-comment-id="${c.commentId}">수정</button>
            <button type="button" class="btn btn-danger btn-sm comment-delete-btn" data-comment-id="${c.commentId}">삭제</button>
          </div>` : ''}
      </div>
      ${badge}
      ${bodyHtml}
      ${!isMasked ? `<div class="comment-edit-form-slot" data-edit-slot-for="${c.commentId}"></div>` : ''}
      ${!isReply && !isMasked ? `<button type="button" class="comment-reply-btn" data-comment-id="${c.commentId}">답글달기</button>` : ''}
      ${!isMasked ? `<div class="comment-reply-form-slot" data-slot-for="${c.commentId}"></div>` : ''}
      ${(c.replies || []).map((r) => renderCommentNode(r, true)).join('')}
    </div>`;
}

function renderCommentList(comments) {
  const wrap = document.getElementById('comment-list');
  if (!wrap) return;

  commentById = new Map((comments || []).map((c) => [Number(c.commentId), c]));

  if (!comments || comments.length === 0) {
    wrap.innerHTML = '<p class="list-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>';
    return;
  }

  const tree = buildCommentTree(comments);
  wrap.innerHTML = tree.map((c) => renderCommentNode(c, false)).join('');
}

function renderReplyForm(parentId) {
  const parent = commentById.get(Number(parentId)) || null;
  const option = resolvePrivacyOption(parent);

  return `
    <form class="comment-reply-form" data-parent-id="${parentId}">
      <div class="form-field">
        <input type="text" class="form-input comment-reply-input" placeholder="답글을 입력하세요" required />
      </div>
      ${resolveInheritNotice(parent)}
      ${renderPrivacyCheckbox(option, `reply-${parentId}`)}
      <button type="submit" class="btn btn-outline btn-sm">답글 등록</button>
      <button type="button" class="btn btn-outline btn-sm comment-reply-cancel">취소</button>
    </form>`;
}

function renderEditForm(commentId, content) {
  return `
    <form class="comment-edit-form" data-comment-id="${commentId}">
      <div class="form-field">
        <input type="text" class="form-input comment-edit-input" value="${escapeAttr(content)}" required />
      </div>
      <button type="submit" class="btn btn-outline btn-sm">저장</button>
      <button type="button" class="btn btn-outline btn-sm comment-edit-cancel">취소</button>
    </form>`;
}

/** 최상위 댓글 입력폼에 「주최자 외 비공개」 체크박스를 붙이거나 떼어냅니다. */
function syncRootPrivacyToggle() {
  const form = document.getElementById('comment-form');
  if (!form) return;

  const existing = form.querySelector('.comment-privacy-toggle');
  const option = resolvePrivacyOption(null);

  if (!option) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return; // 이미 붙어 있으면 유지 (체크 상태 보존)

  const holder = document.createElement('div');
  holder.innerHTML = renderPrivacyCheckbox(option, 'root').trim();
  const node = holder.firstElementChild;
  if (!node) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) form.insertBefore(node, submitBtn);
  else form.appendChild(node);
}

async function handleCommentDelete(commentId) {
  if (!commentId) return;
  const confirmed = confirm('이 댓글을 삭제하시겠습니까? 답글이 달려있다면 함께 삭제됩니다.');
  if (!confirmed) return;

  hideAlert();
  try {
    const res = await deleteCommentApi(commentId);
    if (res && res.success) {
      await loadCommentList();
    } else {
      renderAlert(res?.message || '댓글 삭제에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

async function handleCommentUpdate(commentId, content) {
  if (!commentId || !content) return;

  hideAlert();
  try {
    const res = await updateCommentApi(commentId, content);
    if (res && res.success) {
      await loadCommentList();
    } else {
      renderAlert(res?.message || '댓글 수정에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

function handleCommentReplyClick() {
  const wrap = document.getElementById('comment-list');
  if (!wrap) return;

  wrap.addEventListener('click', (e) => {
    const replyBtn = e.target.closest('.comment-reply-btn');
    if (replyBtn) {
      const parentId = replyBtn.dataset.commentId;
      const slot = wrap.querySelector(`.comment-reply-form-slot[data-slot-for="${parentId}"]`);
      if (slot) {
        slot.innerHTML = slot.innerHTML ? '' : renderReplyForm(parentId);
      }
      return;
    }

    const cancelBtn = e.target.closest('.comment-reply-cancel');
    if (cancelBtn) {
      const slot = cancelBtn.closest('.comment-reply-form-slot');
      if (slot) slot.innerHTML = '';
      return;
    }

    const deleteBtn = e.target.closest('.comment-delete-btn');
    if (deleteBtn) {
      handleCommentDelete(deleteBtn.dataset.commentId);
      return;
    }

    const editBtn = e.target.closest('.comment-edit-btn');
    if (editBtn) {
      const commentId = editBtn.dataset.commentId;
      const slot = wrap.querySelector(`.comment-edit-form-slot[data-edit-slot-for="${commentId}"]`);
      const contentEl = wrap.querySelector(`.comment-content[data-content-for="${commentId}"]`);
      if (!slot) return;
      if (slot.innerHTML) {
        slot.innerHTML = '';
        if (contentEl) contentEl.hidden = false;
      } else {
        slot.innerHTML = renderEditForm(commentId, contentEl ? contentEl.textContent : '');
        if (contentEl) contentEl.hidden = true;
      }
      return;
    }

    const editCancelBtn = e.target.closest('.comment-edit-cancel');
    if (editCancelBtn) {
      const slot = editCancelBtn.closest('.comment-edit-form-slot');
      if (slot) {
        const commentId = slot.dataset.editSlotFor;
        const contentEl = wrap.querySelector(`.comment-content[data-content-for="${commentId}"]`);
        if (contentEl) contentEl.hidden = false;
        slot.innerHTML = '';
      }
    }
  });

  wrap.addEventListener('submit', async (e) => {
    const editForm = e.target.closest('.comment-edit-form');
    if (editForm) {
      e.preventDefault();
      const input = editForm.querySelector('.comment-edit-input');
      const content = input.value.trim();
      if (!content) return;
      await handleCommentUpdate(editForm.dataset.commentId, content);
      return;
    }

    const form = e.target.closest('.comment-reply-form');
    if (!form) return;
    e.preventDefault();
    hideAlert();

    const input = form.querySelector('.comment-reply-input');
    const content = input.value.trim();
    if (!content) return;
    const parentId = form.dataset.parentId;
    const visibility = readVisibilityFrom(form);

    try {
      const res = await createComment({
        targetType: 'market',
        targetId: getMarketIdFromUrl(),
        content,
        parentId,
        visibility,
      });
      if (res && res.success) {
        await loadCommentList();
      } else {
        renderAlert(res?.message || '답글 등록에 실패했어요.');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
  });
}

async function loadCommentList() {
  const wrap = document.getElementById('comment-list');
  if (!wrap) return;

  const marketId = getMarketIdFromUrl();
  try {
    const res = await getCommentList('market', marketId);
    if (res && res.success) {
      if (res.meta) commentMeta = res.meta;
      renderCommentList(res.data || []);
      syncRootPrivacyToggle();
    } else {
      wrap.innerHTML = '<p class="list-empty">댓글을 불러오지 못했어요.</p>';
    }
  } catch (err) {
    wrap.innerHTML = '<p class="list-empty">서버에 연결할 수 없어요.</p>';
  }
}

function handleCommentSubmit() {
  const form = document.getElementById('comment-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    const input = document.getElementById('comment-content');
    const content = input.value.trim();
    if (!content) return;
    const visibility = readVisibilityFrom(form);

    try {
      const res = await createComment({
        targetType: 'market',
        targetId: getMarketIdFromUrl(),
        content,
        visibility,
      });
      if (res && res.success) {
        input.value = '';
        const box = form.querySelector('.comment-privacy-input');
        if (box) box.checked = false;
        await loadCommentList();
      } else {
        renderAlert(res?.message || '댓글 등록에 실패했어요.');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
  });
}
/*환불 관련*/
async function refundMemoBtn() {
  const inputContainer = document.getElementById('inputContainer');
  inputContainer.style.display = 'block'
}
async function refundPayment_(a) {
  const inputContainer = document.getElementById('inputContainer');
  const memotxt = document.getElementById('userInput').value;
  if (!memotxt)
    return;
  if (memotxt.length <= 0) {
    renderAlert('메모를 입력해 주십시오');
    return;
  }
  try {
    const res = await refundPayment(a, memotxt);
    if (res.success)
      renderAlert('환불 처리 완료');
  }
  catch (error) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
  inputContainer.style.display = 'none'
}
async function refundPayment_seller(a) {
  try {
    const res = await refundPayment(a);
    if (res.success)
      renderAlert('환불 처리 완료');
  }
  catch (error) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

// ---------- 초기화 ----------

document.addEventListener('DOMContentLoaded', () => {
  handleMarketCreateSubmit();
  wireCreateMarketImageRemove(); // [추가] 마켓 등록 화면 이미지 삭제 버튼
  loadMarketDetail();
  handleBoothSelectClick();
  loadApplicationList();
  handleCloseMarketClick();
  loadCommentList();
  handleCommentSubmit();
  handleCommentReplyClick();
  initDateInputs();

  prefillBoothApplyForm();
  handleProductImagePreview();
  handleBoothApplySubmit();
});

/* ---------------------- [추가] 마켓 등록 화면: 이미지 삭제 ---------------------- */
// [수정] market-create.html 은 market.js 를 <head> 에서 불러옵니다.
//        즉시 실행(IIFE)으로 두면 <body> 가 아직 없어서 버튼을 못 찾고 그냥 종료됩니다.
//        그래서 아래 DOMContentLoaded 블록에서 호출하도록 일반 함수로 바꿨습니다.
function wireCreateMarketImageRemove() {
  const btn = document.getElementById('remove-market-image-btn');
  const fileInput = document.getElementById('market-image');
  const hidden = document.getElementById('uploadedImagePath');
  // 수정 화면(correctionMarket)은 marketcorrection.js 가 따로 처리하므로 여기서는 제외합니다.
  if (!btn || !fileInput || !hidden || !document.getElementById('market-create-form')) return;

  fileInput.addEventListener('change', () => {
    btn.hidden = !(fileInput.files && fileInput.files[0]);
  });

  btn.addEventListener('click', () => {
    fileInput.value = '';
    hidden.value = '';
    const statusEl = document.getElementById('image-upload-status');
    if (statusEl) statusEl.innerHTML = '';
    btn.hidden = true;
  });
}

/* ---------------------- [추가] 부스 신청 화면: 주최자 닉네임 ---------------------- */
async function renderBoothApplyHost(marketId) {
  const hostEl = document.getElementById('booth-apply-host');
  if (!hostEl || !marketId) return;

  try {
    const res = await getMarketDetail(marketId);
    if (!res || !res.success || !res.data) return;

    const market = res.data;
    hostEl.innerHTML =
      '주최자 ' + ProfileLink.html(market.hostId, market.hostNickname) +
      (market.title ? ` · ${ProfileLink.escapeHtml(market.title)}` : '');
    hostEl.style.display = '';
  } catch (err) {
    console.error('주최자 정보 조회 오류:', err);
  }
}
