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

async function createComment(payload) {
  // payload: { targetType, targetId, content }
  return callApi('/comments', { method: 'POST', body: payload });
}

async function getCommentList(targetType, targetId) {
  return callApi(`/comments?targetType=${targetType}&targetId=${targetId}`);
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

const STATUS_LABEL = { Pending: '대기중', Approved: '승인됨', Rejected: '반려됨' };
const STATUS_CLASS = { Pending: 'pending', Approved: 'approved', Rejected: 'rejected' };

// ---------- 마켓 등록 ----------

function handleMarketCreateSubmit() {
  console.log('등록 시작');
  const form = document.getElementById('market-create-form');
  if (!form) return;
  const submitBtn = document.getElementById('market-create-submit-btn');

  form.addEventListener('submit', async (e) => {
    console.log('마켓 등록 폼 제출 이벤트 발생');
    e.preventDefault();
    hideAlert();

    // ---- 1) 원본 입력값 먼저 읽기 (검증은 가공 전 원본 문자열로) ----
    const titleVal = document.getElementById('title').value.trim();
    const startEventDateVal = document.getElementById('start-event-date').value;
    const endEventDateVal = document.getElementById('end-event-date').value;
    const startRecruitmentDateVal=document.getElementById('recruitmentDate_min').value;
    const endRecruitmentDateVal=document.getElementById('recruitmentDate_max').value;
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
    if (new Date(endEventDateVal) < new Date(startEventDateVal)) {
      renderAlert('종료일은 시작일보다 빠를 수 없어요.');
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
  const wrap = document.getElementById('application-list');
  if (!wrap) return;

  if (!applications || applications.length === 0) {
    wrap.innerHTML = '<p class="list-empty">아직 들어온 신청이 없어요.</p>';
    return;
  }

  wrap.innerHTML = applications
    .map((a) => {
      const status = a.status || 'Pending';
      return `
      <div class="item-card" data-application-id="${a.applicationId}">
        <div class="item-card-top">
          <div>
            <div class="item-card-title">${a.itemName || '이름 미입력'} · ${a.boothNumber}번 부스${a.title ? ` · ${a.title}` : ''}</div>
            <div class="item-card-meta">신청자: ${a.sellerId || '-'}</div>
          </div>
          <span class="status-tag ${STATUS_CLASS[status] || 'pending'}">${STATUS_LABEL[status] || status}</span>
        </div>
        ${status === 'Pending' ? `
        <div class="item-card-actions">
          <button type="button" class="btn btn-sage btn-sm" data-action="approve" data-id="${a.applicationId}">승인</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="reject" data-id="${a.applicationId}">반려</button>
        </div>` : ''}
      </div>`;
    })
    .join('');

  wrap.querySelectorAll('[data-action="approve"]').forEach((btn) => {
    btn.addEventListener('click', () => handleApplicationDecision(btn.dataset.id, 'approve'));
  });
  wrap.querySelectorAll('[data-action="reject"]').forEach((btn) => {
    btn.addEventListener('click', () => handleApplicationDecision(btn.dataset.id, 'reject'));
  });
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
      wrap.innerHTML = '<p class="list-empty">신청 목록을 불러오지 못했어요.</p>';
    }
  } catch (err) {
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
  return `
    <div class="comment-item${isReply ? ' comment-item-reply' : ''}" data-comment-id="${c.commentId}">
      <div class="comment-nickname">${c.nickname || '알 수 없음'}</div>
      <div class="comment-content">${c.content}</div>
      ${!isReply ? `<button type="button" class="comment-reply-btn" data-comment-id="${c.commentId}">답글달기</button>` : ''}
      <div class="comment-reply-form-slot" data-slot-for="${c.commentId}"></div>
      ${(c.replies || []).map((r) => renderCommentNode(r, true)).join('')}
    </div>`;
}

function renderCommentList(comments) {
  const wrap = document.getElementById('comment-list');
  if (!wrap) return;

  if (!comments || comments.length === 0) {
    wrap.innerHTML = '<p class="list-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>';
    return;
  }

  const tree = buildCommentTree(comments);
  wrap.innerHTML = tree.map((c) => renderCommentNode(c, false)).join('');
}

function renderReplyForm(parentId) {
  return `
    <form class="comment-reply-form" data-parent-id="${parentId}">
      <div class="form-field">
        <input type="text" class="form-input comment-reply-input" placeholder="답글을 입력하세요" required />
      </div>
      <button type="submit" class="btn btn-outline btn-sm">답글 등록</button>
      <button type="button" class="btn btn-outline btn-sm comment-reply-cancel">취소</button>
    </form>`;
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
    }
  });

  wrap.addEventListener('submit', async (e) => {
    const form = e.target.closest('.comment-reply-form');
    if (!form) return;
    e.preventDefault();
    hideAlert();

    const input = form.querySelector('.comment-reply-input');
    const content = input.value.trim();
    if (!content) return;
    const parentId = form.dataset.parentId;

    try {
      const res = await createComment({
        targetType: 'market',
        targetId: getMarketIdFromUrl(),
        content,
        parentId,
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
      renderCommentList(res.data || []);
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

    try {
      const res = await createComment({ targetType: 'market', targetId: getMarketIdFromUrl(), content });
      if (res && res.success) {
        input.value = '';
        await loadCommentList();
      } else {
        renderAlert(res?.message || '댓글 등록에 실패했어요.');
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
  });
}

// ---------- 초기화 ----------

document.addEventListener('DOMContentLoaded', () => {
  handleMarketCreateSubmit();
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
