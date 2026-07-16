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
  const form = document.getElementById('market-create-form');
  if (!form) return;
  const submitBtn = document.getElementById('market-create-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const payload = {
      title: document.getElementById('title').value.trim(),
      eventDate: document.getElementById('event-date').value,
      boothPrice: Number(document.getElementById('booth-price').value) || 0,
      description: document.getElementById('description').value.trim(),
      locationName: document.getElementById('address-input').value.trim(),
      latitude: document.getElementById('latitude').value || null,
      longitude: document.getElementById('longitude').value || null,
    };

    if (!payload.title || !payload.eventDate) {
      renderAlert('마켓 이름과 개최 일자는 꼭 입력해주세요.');
      return;
    }

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
  document.querySelectorAll('#booth-select .booth-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const marketId = getMarketIdFromUrl();
      window.location.href = `booth-apply.html?marketId=${marketId}&booth=${btn.dataset.booth}`;
    });
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
            <div class="item-card-title">${a.itemName || '이름 미입력'} · ${a.boothNumber}번 부스</div>
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
    backLink.href = `market-detail.html?marketId=${params.get('marketId') || ''}`;
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

function handleBoothApplySubmit() {
  const form = document.getElementById('booth-apply-form');
  if (!form) return;
  const submitBtn = document.getElementById('booth-apply-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const payload = {
      marketId: document.getElementById('market-id').value,
      boothNumber: document.getElementById('booth-number').value,
      itemName: document.getElementById('item-name').value.trim(),
      productDesc: document.getElementById('product-desc').value.trim(),
      // TODO(백엔드 연동 시): 이미지 업로드는 별도 multipart 엔드포인트가 필요해요.
      // 지금은 파일명만 참고용으로 함께 보냅니다.
      itemImage: document.getElementById('product-image').files?.[0]?.name || null,
    };

    if (!payload.itemName) {
      renderAlert('판매 물품 이름을 입력해주세요.');
      return;
    }

    setButtonLoading(submitBtn, true, '신청 중...', '신청하기');
    try {
      const res = await applyForBooth(payload);
      if (res && res.success) {
        renderAlert('부스 신청이 완료됐어요!', 'success');
        setTimeout(() => {
          window.location.href = `market-detail.html?marketId=${payload.marketId}`;
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

function renderCommentList(comments) {
  const wrap = document.getElementById('comment-list');
  if (!wrap) return;

  if (!comments || comments.length === 0) {
    wrap.innerHTML = '<p class="list-empty">아직 댓글이 없어요. 첫 댓글을 남겨보세요.</p>';
    return;
  }

  wrap.innerHTML = comments
    .map((c) => `<div class="comment-item">${c.content}</div>`)
    .join('');
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

  prefillBoothApplyForm();
  handleProductImagePreview();
  handleBoothApplySubmit();
});
