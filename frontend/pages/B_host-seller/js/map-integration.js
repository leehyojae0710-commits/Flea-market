// 담당 B: 마켓 등록 화면의 주소 검색 UI ↔ 담당 E의 integration/map.js 연결 글루 코드
// integration/map.js 자체는 담당 E가 관리하므로 이 파일에서는 가져다 쓰기만 합니다.

import { searchAddressToCoordinates, renderMapPin } from '../../../integration/map.js';

function handleAddressSearchClick() {
  const btn = document.getElementById('address-search-btn');
  const input = document.getElementById('address-input');
  const mapContainer = document.getElementById('map-container');
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  if (!btn || !input || !mapContainer) return;

  btn.addEventListener('click', async () => {
    const address = input.value.trim();
    if (!address) return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '검색 중...';
    try {
      const coords = await searchAddressToCoordinates(address);
      if (latInput) latInput.value = coords.lat;
      if (lngInput) lngInput.value = coords.lng;
      renderMapPin(mapContainer, coords);
      mapContainer.textContent = `📍 위치를 찾았어요 (${coords.lat}, ${coords.lng})`;
    } catch (err) {
      mapContainer.textContent = '주소 검색에 실패했어요. 다시 시도해주세요.';
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

document.addEventListener('DOMContentLoaded', handleAddressSearchClick);
