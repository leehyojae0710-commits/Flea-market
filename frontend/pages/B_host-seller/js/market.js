// 담당 B: 주최측/판매자 화면 프론트 로직

async function createMarket(payload) {
  return callApi('/markets', { method: 'POST', body: payload });
}

async function getMarketDetail(marketId) {
  return callApi(`/markets/${marketId}`);
}

async function approveSellerApplication(applicationId) {
  return callApi(`/applications/${applicationId}/approve`, { method: 'PATCH' });
}

async function rejectSellerApplication(applicationId) {
  return callApi(`/applications/${applicationId}/reject`, { method: 'PATCH' });
}

async function applyForBooth(payload) {
  // payload: { marketId, boothNumber, productImage, productDesc }
  return callApi('/applications', { method: 'POST', body: payload });
}

async function createComment(payload) {
  // payload: { targetType, targetId, content }
  return callApi('/comments', { method: 'POST', body: payload });
}

async function getCommentList(targetType, targetId) {
  return callApi(`/comments?targetType=${targetType}&targetId=${targetId}`);
}

function handleMarketCreateSubmit() {
  const form = document.getElementById('market-create-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('title').value,
      eventDate: document.getElementById('event-date').value,
      boothPrice: document.getElementById('booth-price').value,
      description: document.getElementById('description').value,
    };
    await createMarket(payload);
  });
}

function handleBoothSelectClick() {
  document.querySelectorAll('#booth-select button').forEach((btn) => {
    btn.addEventListener('click', () => {
      // 선택한 부스 번호를 들고 신청 페이지로 이동
      window.location.href = `booth-apply.html?booth=${btn.dataset.booth}`;
    });
  });
}

function handleBoothApplySubmit() {
  const form = document.getElementById('booth-apply-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      marketId: document.getElementById('market-id').value,
      boothNumber: document.getElementById('booth-number').value,
      productDesc: document.getElementById('product-desc').value,
    };
    await applyForBooth(payload);
  });
}

function handleCommentSubmit() {
  const form = document.getElementById('comment-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = document.getElementById('comment-content').value;
    await createComment({ targetType: 'market', targetId: getMarketIdFromUrl(), content });
  });
}

function getMarketIdFromUrl() {
  return new URLSearchParams(window.location.search).get('marketId');
}

document.addEventListener('DOMContentLoaded', () => {
  handleMarketCreateSubmit();
  handleBoothSelectClick();
  handleBoothApplySubmit();
  handleCommentSubmit();
});
