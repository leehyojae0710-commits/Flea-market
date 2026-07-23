async function deleteMarket(marketId) {
  return callApi(`/markets/${marketId}`, { method: 'DELETE' });
}
async function getMyMarkets() {
  return callApi('/markets/mine');
}

async function clickdelet(selectedMarketId) {
  if (!selectedMarketId) return;

  const confirmed = confirm('정말 이 마켓을 삭제하시겠습니까?');
  if (!confirmed) return;

  const res = await deleteMarket(selectedMarketId);

  if (res.success) {
    alert('마켓이 삭제되었습니다.');
    await loadMyMarkets(); // 목록 새로고침
  } else {
    alert(res.message || '삭제에 실패했습니다.');
  }
}


function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadMyMarkets() {
  const listEl = document.getElementById('market-list');
  const emptyEl = document.getElementById('empty-state');

  const res = await getMyMarkets();

  if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;

  listEl.innerHTML = res.data.map(market => `
      <li class="my-market-item" data-market-id="${market.marketId}">
        <div class="my-market-item-top">
          <span class="my-market-item-title">${market.title}</span>
          <div class="my-market-item-actions">
          <button type="button" class="btn btn-danger btn-sm" onclick="clickdelet(${market.marketId})">삭제하기</button>
          <a href = "../B_host-seller/correctionMarket?marketId=${market.marketId}" class="btn btn-danger btn-sm">수정하기</a>
          </div>
        </div>
        <div class="my-market-item-meta">
          ${formatDate(market.eventDate_min)} ~ ${formatDate(market.eventDate_max)}
        </div>
        <div class="my-market-item-meta">${market.locationName || ''}</div>
      </li>
    `).join('');
}

document.addEventListener('DOMContentLoaded', loadMyMarkets);