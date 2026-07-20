// 마켓 상세 페이지 - 추가 정보 표시 (market.js는 건드리지 않음)
//
// market.js의 renderMarketDetail()은 title/eventDate/locationName/boothPrice만 그려주는데,
// DB 스키마가 eventDate 단일 컬럼 -> eventDate_min/eventDate_max(기간) 으로 바뀌면서
// market.eventDate가 더 이상 내려오지 않아 원래 코드의 날짜 표시가 비어버립니다.
// 이 파일은 market.js가 로드된 "이후"에 실행되면서, 전역 함수 renderMarketDetail을
// 감싸는(wrap) 방식으로 다음 항목을 추가/보정해서 렌더링합니다:
//   - eventDate_min ~ eventDate_max (개최 기간) 및 D-day(남은 날짜) 표시
//   - description (설명)
//   - marketImage (대표 이미지)
//   - isExpired + 기간 경과 여부를 합친 모집중/마감 상태 배지
//   - latitude/longitude (카카오맵 링크, 마감 시 부스 선택 비활성화)
//
// market.js는 <script> 태그(비-모듈)로 로드되므로 그 안의 top-level 함수 선언은
// 전역(window)에 등록됩니다. 아래에서 window.renderMarketDetail을 감싸 두면,
// market.js의 loadMarketDetail()이 나중에 renderMarketDetail(...)을 호출할 때
// 이 확장된 버전이 실행됩니다. market.js 파일 자체는 한 글자도 수정하지 않습니다.

(function () {
  const originalRenderMarketDetail = window.renderMarketDetail;
  if (typeof originalRenderMarketDetail !== 'function') {
    console.error('market-detail-extra.js: renderMarketDetail을 찾을 수 없어요. market.js가 먼저 로드되어야 합니다.');
    return;
  }

  window.renderMarketDetail = function renderMarketDetailExtended(market) {
    // 1) 기존 렌더링(title/locationName/boothPrice) 그대로 실행
    //    (market.eventDate는 더 이상 없으므로 원본 코드에서는 자동으로 빈 값 처리됨)
    originalRenderMarketDetail(market);

    const today = startOfDay(new Date());
    const startDate = parseDate(market.eventDate_min);
    const endDate = parseDate(market.eventDate_max);
    const naturallyEnded = endDate ? today > endDate : false;
    const isExpired = Number(market.isExpired) === 1 || naturallyEnded;

    renderEventDateRange(market.eventDate_min, market.eventDate_max, market.locationName, market.boothPrice);
    renderDDay(today, startDate, endDate, isExpired);
    renderMarketStatusBadge(isExpired);
    renderMarketImage(market.marketImage);
    renderMarketDescription(market.description);
    renderMarketMapLink(market.title, market.latitude, market.longitude);
    applyBoothSelectAvailability(isExpired);
  };

  function parseDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatDateKo(date) {
    if (!date) return '';
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
  }

  function diffDays(a, b) {
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }

  // 개최 기간(eventDate_min ~ eventDate_max) + 장소 + 참가비를 하단 안내줄에 다시 채워넣음
  function renderEventDateRange(startStr, endStr, locationName, boothPrice) {
    const infoEl = document.getElementById('market-info');
    if (!infoEl) return;

    const startDate = parseDate(startStr);
    const endDate = parseDate(endStr);
    let periodText = '';
    if (startDate && endDate) {
      periodText = startDate.getTime() === endDate.getTime()
        ? formatDateKo(startDate)
        : `${formatDateKo(startDate)} ~ ${formatDateKo(endDate)}`;
    }

    infoEl.textContent = [periodText, locationName, formatPrice(boothPrice)]
      .filter(Boolean)
      .join(' · ');
  }

  // 진행 중인 행사의 남은 날짜(D-day) 표시
  function renderDDay(today, startDate, endDate, isExpired) {
    const ddayEl = document.getElementById('market-dday');
    if (!ddayEl) return;

    ddayEl.classList.remove('dday-upcoming', 'dday-ongoing', 'dday-ended');

    if (!startDate || !endDate) {
      ddayEl.style.display = 'none';
      return;
    }

    if (isExpired) {
      ddayEl.textContent = '행사가 종료됐어요.';
      ddayEl.classList.add('dday-ended');
      ddayEl.style.display = '';
      return;
    }

    if (today < startDate) {
      const dLeft = diffDays(startDate, today);
      ddayEl.textContent = `개최까지 D-${dLeft}`;
      ddayEl.classList.add('dday-upcoming');
    } else {
      const dLeft = diffDays(endDate, today);
      ddayEl.textContent = dLeft === 0 ? '오늘 마지막 날이에요!' : `진행 중 · 종료까지 D-${dLeft}`;
      ddayEl.classList.add('dday-ongoing');
    }
    ddayEl.style.display = '';
  }

  function renderMarketStatusBadge(isExpired) {
    const statusEl = document.getElementById('market-status');
    if (!statusEl) return;
    statusEl.style.display = '';
    statusEl.textContent = isExpired ? '마감' : '모집중';
    statusEl.classList.remove('open', 'closed');
    statusEl.classList.add(isExpired ? 'closed' : 'open');
  }

  function renderMarketImage(marketImage) {
    const imageEl = document.getElementById('market-image');
    if (!imageEl) return;
    if (!marketImage) {
      imageEl.style.display = 'none';
      return;
    }
    // API_BASE_URL은 api.js(전역 스크립트)에서 선언된 값을 그대로 재사용합니다.
    imageEl.src = marketImage.startsWith('http') ? marketImage : `${API_BASE_URL}${marketImage}`;
    imageEl.style.display = '';
  }

  function renderMarketDescription(description) {
    const descEl = document.getElementById('market-description');
    if (!descEl) return;
    descEl.textContent = description || '';
  }

  function renderMarketMapLink(title, latitude, longitude) {
    const mapLinkEl = document.getElementById('market-map-link');
    if (!mapLinkEl) return;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!lat || !lng) {
      mapLinkEl.style.display = 'none';
      return;
    }
    mapLinkEl.href = `https://map.kakao.com/link/map/${encodeURIComponent(title || '마켓')},${lat},${lng}`;
    mapLinkEl.style.display = '';
  }

  function applyBoothSelectAvailability(isExpired) {
    const boothHintEl = document.getElementById('booth-select-hint');
    document.querySelectorAll('#booth-select .booth-btn').forEach((btn) => {
      btn.disabled = isExpired;
    });
    if (boothHintEl) {
      boothHintEl.textContent = isExpired
        ? '마감된 마켓이라 더 이상 부스 신청을 받지 않아요.'
        : '참가하고 싶은 부스 번호를 선택하면 신청 화면으로 이동해요.';
    }
  }
})();
