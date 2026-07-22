async function deleteMarket(marketId) {
    return callApi(`/markets/${marketId}`, { method: 'DELETE' });
}

document.getElementById('market-delete-btn').addEventListener('click', async () => {
  console.log("눌림ㅇㅇㅇㅇ");
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
});