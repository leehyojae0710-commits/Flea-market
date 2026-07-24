// 담당 B: 주최자 화면 - 내 마켓 관리
// 부스 관리(mybooth.js)와 동일한 패턴(로그인 가드, 상태 필터, alert-box, try/catch)을 따릅니다.
// 삭제하기/수정하기 모두 별도 페이지 이동 방식입니다(마켓 등록/수정 폼이 지도·이미지 등으로 커서
// 부스처럼 카드 인라인으로 넣기엔 무리가 있다고 판단했습니다).

// ---------- API 호출 ----------

async function deleteMarket(marketId) {
  return callApi(`/markets/${marketId}`, { method: 'DELETE' });
}

async function getMyMarkets() {
  return callApi('/markets/mine');
}

// ---------- 화면 피드백 유틸 (mybooth.js / market.js와 동일) ----------

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

const STATUS_LABEL = { open: '모집중', closed: '마감' };

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- 상태 ----------

let allMarkets = [];
let myMarkets = [];
let statusFilter = '';
let expandedId = null; // 상세정보가 펼쳐진 마켓 id (mybooth.js와 동일한 패턴)

// ---------- 렌더링 ----------

function renderMarketList() {
  const listEl = document.getElementById('market-list');
  const emptyEl = document.getElementById('empty-state');
  const countEl = document.getElementById('result-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = allMarkets.length === 0 ? '' : `${myMarkets.length}건`;
  }

  if (!myMarkets || myMarkets.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = allMarkets.length === 0
        ? '등록한 마켓이 없어요. 마켓을 등록해보세요.'
        : '해당 상태의 마켓이 없어요.';
    }
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  listEl.innerHTML = myMarkets.map((market) => renderMarketItem(market)).join('');

  listEl.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener('click', () => handleToggleDetail(el.dataset.id));
  });
  listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.id));
  });
}

function renderMarketItem(market) {
  const isOpen = !market.isExpired;
  const statusKey = isOpen ? 'open' : 'closed';
  const id = market.marketId;
  const isExpanded = expandedId === String(id) || expandedId === id;

  return `
    <li class="my-market-item" data-market-id="${id}">
      <div class="my-market-item-top" data-action="toggle" data-id="${id}" style="cursor:pointer;">
        <span class="my-market-item-title">${market.title}</span>
        <span class="status-tag ${statusKey}">${STATUS_LABEL[statusKey]}</span>
      </div>
      <div class="item-card-actions">
        <a class="btn btn-outline btn-sm" href="${isOpen ? `correctionMarket?marketId=${id}` : '#'}" ${isOpen ? '' : 'aria-disabled="true" tabindex="-1" title="마감된 마켓은 수정할 수 없어요." onclick="return false;"'}>수정하기</a>
        <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${id}">삭제하기</button>
      </div>

      ${isExpanded ? renderMarketDetail(market) : ''}
    </li>
  `;
}

function renderMarketDetail(market) {
  return `
    <div class="item-card-detail">
      <p class="item-card-meta">마켓 이름: ${market.title || '-'}</p>
      <p class="item-card-meta">개최 일자: ${formatDate(market.eventDate_min)} ~ ${formatDate(market.eventDate_max)}</p>
      <p class="item-card-meta">모집 일자: ${formatDate(market.recruitmentDate_min)} ~ ${formatDate(market.recruitmentDate_max)}</p>
      <p class="item-card-meta">장소: ${market.locationName || '-'}</p>
      <p class="item-card-meta">소개: ${market.description || '등록된 소개가 없어요.'}</p>
    </div>`;
}

// ---------- 이벤트 핸들러 ----------

function handleToggleDetail(id) {
  expandedId = expandedId === id ? null : id;
  renderMarketList();
}

async function handleDeleteClick(marketId) {
  hideAlert();
  if (!marketId) return;

  const confirmed = window.confirm('정말 이 마켓을 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없어요.');
  if (!confirmed) return;

  try {
    const res = await deleteMarket(marketId);
    if (res && res.success) {
      renderAlert('마켓이 삭제되었어요.', 'success');
      if (expandedId === marketId) expandedId = null;
      await loadMyMarkets();
    } else {
      renderAlert(res?.message || '삭제에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

// ---------- 필터 ----------

function applyStatusFilter() {
  myMarkets = statusFilter
    ? allMarkets.filter((m) => (m.isExpired ? 'closed' : 'open') === statusFilter)
    : allMarkets;
  renderMarketList();
}

function handleFilterChange() {
  statusFilter = document.getElementById('status-filter')?.value || '';
  expandedId = null;
  applyStatusFilter();
}

// ---------- 초기 로드 ----------

async function loadMyMarkets() {
  const listEl = document.getElementById('market-list');
  if (!listEl) return;

  try {
    const res = await getMyMarkets();
    if (res && res.success) {
      allMarkets = res.data || [];
      applyStatusFilter();
    } else {
      listEl.innerHTML = '<p class="list-empty">마켓 목록을 불러오지 못했어요.</p>';
    }
  } catch (err) {
    listEl.innerHTML = '<p class="list-empty">서버에 연결할 수 없어요.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isLoggedIn = !!sessionStorage.getItem('loggedInUser');
  if (!isLoggedIn) {
    window.location.href = '../A_auth-main/login.html';
    return;
  }
  document.getElementById('status-filter')?.addEventListener('change', handleFilterChange);
  loadMyMarkets();
});
