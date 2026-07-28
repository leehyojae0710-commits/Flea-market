// 담당 B: 주최자 화면 - 내 마켓 관리
// [수정] 토글(펼치기/접기) 시 renderMarketList() 전체 재실행 대신,
//        해당 카드의 상세 영역만 부분 업데이트하도록 변경 (성능/버벅임 개선)

// ---------- API 호출 ----------

async function deleteMarket(marketId) {
  return callApi(`/markets/closed/${marketId}`, { method: 'PATCH' });
}

async function getMyMarkets() {
  return callApi('/markets/mine');
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

const STATUS_LABEL = { open: '모집중', closed: '마감', cancel: '취소됨' };

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStatusKey(isExpired) {
  switch (isExpired) {
    case 0:
      return 'open';
    case 1:
      return 'closed';
    case 2:
      return 'cancel';
    default:
      return 'open';
  }
}

// ---------- 상태 ----------

let allMarkets = [];
let myMarkets = [];
let statusFilter = '';
let expandedId = null; // 상세정보가 펼쳐진 마켓 id

// ---------- 부스 모집 현황 게이지 ----------

// 마켓의 총 부스 수 / 현재 신청된 부스 수 / 참여율(%)
function getBoothRecruitStats(m) {
  const total = Number(m.maxparticipants ?? m.maxParticipants) || 0;
  const applied = Number(m.appliedBooths) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((applied / total) * 100)) : 0;
  return { applied, total, pct };
}

function boothRecruitLevel(pct) {
  if (pct >= 80) return 'high'; // 마감 임박
  if (pct >= 50) return 'mid'; // 보통
  return 'low'; // 여유
}

// 마켓 카드 하단에 붙는 모집 현황 게이지 (판매자 화면과 동일한 mb-gauge-* 스타일 재사용)
function renderBoothRecruitGauge(m) {
  const { applied, total, pct } = getBoothRecruitStats(m);
  if (total === 0) return '';
  const level = boothRecruitLevel(pct);
  return `
    <div class="mb-gauge" data-level="${level}">
      <div class="mb-gauge-head">
        <span class="mb-gauge-title">부스 모집 현황</span>
        <span class="mb-gauge-pct">${pct}%</span>
      </div>
      <div class="mb-gauge-track" role="progressbar"
           aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
           aria-label="부스 모집률 ${pct}%">
        <div class="mb-gauge-fill" style="width:${pct}%"></div>
      </div>
      <div class="mb-gauge-foot">
        <span class="mb-gauge-count"><strong>${applied}</strong> / ${total} 부스 모집</span>
      </div>
    </div>`;
}

// ---------- 렌더링 (목록 전체) ----------

function renderMarketList() {
  const listEl = document.getElementById('market-list');
  const emptyEl = document.getElementById('empty-state');
  const countEl = document.getElementById('result-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent =
      allMarkets.length === 0 ? '' : `${myMarkets.length}건`;
  }

  if (!myMarkets || myMarkets.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent =
        allMarkets.length === 0
          ? '등록한 마켓이 없어요. 마켓을 등록해보세요.'
          : '해당 상태의 마켓이 없어요.';
    }
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  listEl.innerHTML = myMarkets
    .map((market) => renderMarketItem(market))
    .join('');

  listEl.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener('click', () => handleToggleDetail(el.dataset.id));
  });
  listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.id));
  });
}

// ---------- 렌더링 (카드 한 장) ----------

function renderMarketItem(market) {
  const isOpen = market.isExpired;
  const statusKey = getStatusKey(isOpen);
  const id = market.marketId;
  const isExpanded = expandedId === String(id) || expandedId === id;

  // [수정] 기존에는 href="${marketUrl} ${marketUrl2}" 처럼 속성이 href 문자열 안에
  //        들어가 있어서 링크가 깨졌습니다. href 와 나머지 속성을 분리합니다.
  let marketUrl = '#';
  let marketAttrs = '';

  if (statusKey === 'open') {
    marketUrl = `correctionMarket?marketId=${id}`;
  } else {
    const reason =
      statusKey === 'closed'
        ? '마감된 마켓은 수정할 수 없어요.'
        : '취소된 마켓은 수정할 수 없어요.';
    marketAttrs = `aria-disabled="true" tabindex="-1" title="${reason}" onclick="return false;"`;
  }

  return `
<li class="my-market-item"
    data-market-id="${id}"
    style="${statusKey === 'cancel' ? 'pointer-events:none; opacity:0.5;' : ''}">

  <div class="my-market-item-top"
       data-action="toggle"
       data-id="${id}"
       style="cursor:pointer;">
    <span class="my-market-item-title">${market.title}</span>
    <span class="status-tag ${statusKey}">${STATUS_LABEL[statusKey]}</span>
  </div>

  <div class="item-card-actions">
    <a class="btn btn-outline btn-sm" href="${marketUrl}" ${marketAttrs}>수정하기</a>
    <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${id}">취소하기</button>
    <a class="btn btn-sage btn-sm" href="market-detail?marketId=${id}">보러가기</a>
  </div>

  ${renderBoothRecruitGauge(market)}

  <!-- 📌 상세 영역은 별도 컨테이너로 분리, id로 특정해서 부분 업데이트 -->
  <div class="market-detail-slot" id="market-detail-${id}">${isExpanded ? renderMarketDetail(market) : ''}</div>
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

// 📌 핵심 수정: renderMarketList() 전체 재실행 대신, 해당 슬롯만 innerHTML 교체
function handleToggleDetail(id) {
  const prevId = expandedId;
  const isCollapsing = String(prevId) === String(id);

  expandedId = isCollapsing ? null : id;

  // 이전에 열려있던 카드가 있고, 지금 누른 카드와 다르면 -> 닫아줌
  if (prevId !== null && String(prevId) !== String(id)) {
    updateDetailSlot(prevId, false);
  }

  // 지금 누른 카드는 열림/닫힘 토글
  updateDetailSlot(id, !isCollapsing);
}

function updateDetailSlot(id, shouldExpand) {
  const slot = document.getElementById(`market-detail-${id}`);
  if (!slot) return;

  if (!shouldExpand) {
    slot.innerHTML = '';
    return;
  }

  const market = myMarkets.find((m) => String(m.marketId) === String(id));
  if (!market) return;

  slot.innerHTML = renderMarketDetail(market);
}

async function handleDeleteClick(marketId) {
  hideAlert();
  if (!marketId) return;

  const confirmed = window.confirm(
    '정말 이 마켓을 취소하시겠습니까? 취소 후에는 되돌릴 수 없어요.',
  );
  if (!confirmed) return;

  try {
    const res = await deleteMarket(marketId);
    if (res && res.success) {
      renderAlert('마켓이 취소되었습니다.', 'success');
      if (String(expandedId) === String(marketId)) expandedId = null;
      await loadMyMarkets();
    } else {
      renderAlert(res?.message || '취소에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

// ---------- 필터 ----------

function applyStatusFilter() {
  myMarkets = statusFilter
    ? allMarkets.filter((m) => getStatusKey(m.isExpired) === statusFilter)
    : allMarkets;
  renderMarketList(); // 필터 변경 시에는 목록 자체가 바뀌니 전체 재렌더링이 맞음
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
      listEl.innerHTML =
        '<p class="list-empty">마켓 목록을 불러오지 못했어요.</p>';
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
  document
    .getElementById('status-filter')
    ?.addEventListener('change', handleFilterChange);
  loadMyMarkets();
});