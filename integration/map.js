// 담당 E: 지도 API 연동 (네이버/구글 지도)
// 프론트 B의 주소 검색 화면에서 호출 -> 위경도 좌표를 얻어서
// PATCH /api/markets/:marketId/location 으로 백엔드에 저장하는 흐름입니다.

/**
 * 주소 문자열로 지도 검색 후 좌표를 반환합니다.
 * @param {string} addressQuery
 * @returns {Promise<{lat: number, lng: number}>}
 */
async function searchAddressToCoordinates(addressQuery) {
  // TODO: 네이버/구글 지도 Geocoding API 호출
  return { lat: 0, lng: 0 };
}

/**
 * 지도 위에 핀을 표시합니다. (가상 데이터 입력 지원)
 * @param {HTMLElement} mapContainer
 * @param {{lat:number,lng:number}} coordinates
 */
function renderMapPin(mapContainer, coordinates) {
  // TODO: 지도 SDK 초기화 및 마커 렌더링
}

export { searchAddressToCoordinates, renderMapPin };
