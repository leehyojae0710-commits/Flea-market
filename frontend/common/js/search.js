document.addEventListener('DOMContentLoaded', () => {
  const mainGrid = document.getElementById('market-grid') || document.querySelector('.market-grid');
  const boothList = document.getElementById('booth-list') || document.querySelector('.booth-list') || document.querySelector('.booth-container');
  const myMarketList = document.getElementById('market-list') || document.querySelector('.market-list') || document.querySelector('.market-container');

  const container = mainGrid || boothList || myMarketList;
  if (!container) return;

  const isMainPage = !!mainGrid; // 메인페이지 여부

  // 페이징 관련 상태 관리
  const ITEMS_PER_PAGE = 9;
  let currentSearchResults = [];
  let currentPage = 1;

  // 1. 검색 바 UI 생성 및 삽입
  const searchBar = document.createElement('div');
  searchBar.className = 'search-bar-container';
  searchBar.innerHTML = `
    <div class="search-input-box">
      <input type="text" class="search-input" placeholder="키워드로 검색해 보세요" autocomplete="off" />
      <button type="button" class="search-clear-btn" title="삭제">✕</button>
    </div>
    <button type="button" class="search-submit-btn">검색</button>
  `;

  const mountPoint = document.querySelector('.filter-strip') || document.querySelector('.search-area') || container.parentNode;
  if (mountPoint === container.parentNode) {
    container.parentNode.insertBefore(searchBar, container);
  } else {
    mountPoint.appendChild(searchBar);
  }

  const inputEl = searchBar.querySelector('.search-input');
  const clearBtn = searchBar.querySelector('.search-clear-btn');
  const submitBtn = searchBar.querySelector('.search-submit-btn');

  // 2. 메인페이지용: 서버 검색 요청 및 결과 저장
  async function fetchSearchResults(keyword) {
    try {
      // main.js에서 관리하는 현재 선택된 탭(모집 중/진행 중/진행 예정/종료)과
      // 정렬 드롭다운 값(마감임박순/최신등록순/낮은가격순)을 함께 전달
      const tab = typeof currentTab !== 'undefined' ? currentTab : '';
      const sortValue = document.getElementById('sort-filter')?.value || '';
      const sort = typeof toBackendSort === 'function' ? toBackendSort(sortValue) : sortValue;
      const response = await fetch(`http://localhost:5000/api/search?keyword=${encodeURIComponent(keyword)}&type=market&tab=${encodeURIComponent(tab)}&sort=${encodeURIComponent(sort)}`);
      if (!response.ok) throw new Error(`서버 응답 오류: ${response.status}`);

      const data = await response.json();

      if (data.success) {
        currentSearchResults = data.markets || [];
        currentPage = 1; // 검색 시 1페이지로 리셋

        // 검색 결과 렌더링 & 페이징 UI 생성
        renderPagedMarkets();
      }
    } catch (err) {
      console.error('검색 중 오류 발생:', err);
    }
  }

  // 3. 메인페이지용: 9개씩 슬라이스해서 그려주는 페이징 렌더러
  function renderPagedMarkets() {
    const totalItems = currentSearchResults.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    // 현재 페이지 범위에 맞게 9개 추출
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const pagedMarkets = currentSearchResults.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    // 기존 렌더링 함수가 정의되어 있으면 9개 전달, 없으면 직접 DOM 생성
    if (typeof renderMarkets === 'function') {
      renderMarkets(pagedMarkets);
    } else if (typeof displayMarkets === 'function') {
      displayMarkets(pagedMarkets);
    } else if (typeof renderMarketList === 'function') {
      renderMarketList(pagedMarkets, totalItems);
    } else {
      renderMarketCardsDirectly(container, pagedMarkets);
    }

    // 하단 페이징 버튼 UI 업데이트
    updatePaginationUI(totalPages);
  }

  // 4. 하단 페이징 버튼 동적 생성 및 이벤트 연결
  function updatePaginationUI(totalPages) {
    let paginationContainer = document.querySelector('.pagination') || document.getElementById('pagination');

    if (!paginationContainer) {
      paginationContainer = document.createElement('div');
      paginationContainer.className = 'pagination';
      container.parentNode.appendChild(paginationContainer);
    }

    paginationContainer.innerHTML = '';

    if (totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }

    paginationContainer.style.display = 'flex';

    // 이전 버튼
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn prev-btn';
    prevBtn.textContent = '‹';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderPagedMarkets();
      }
    });
    paginationContainer.appendChild(prevBtn);

    // 숫자 페이지 버튼들
    for (let i = 1; i <= totalPages; i++) {
      const pageBtn = document.createElement('button');
      pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
      pageBtn.textContent = i;
      pageBtn.addEventListener('click', () => {
        currentPage = i;
        renderPagedMarkets();
      });
      paginationContainer.appendChild(pageBtn);
    }

    // 다음 버튼
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn next-btn';
    nextBtn.textContent = '›';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderPagedMarkets();
      }
    });
    paginationContainer.appendChild(nextBtn);
  }

  // 5. mybooth / mymarketpage용 실시간 필터링
  //
  // [수정] mybooth.html / mymarketpage.html 은 이제 페이지네이션 때문에
  //   한 번에 5건만 DOM(container.children)에 그려져 있어서, 예전처럼
  //   화면에 보이는 카드 텍스트만 훑으면 다른 페이지에 있는 항목은
  //   검색해도 걸리지 않는 문제가 있었습니다.
  //   그래서 각 목록 스크립트(mybooth.js/marketdelete.js)가 전체 데이터를
  //   기준으로 다시 필터링하도록 window.setMyBoothSearchKeyword /
  //   window.setMyMarketSearchKeyword 훅을 우선 사용하고,
  //   그 훅이 없는 화면에서는 기존 방식(화면에 보이는 카드만 훑기)으로 동작합니다.
  function filterClientSideCards() {
    const keyword = inputEl.value.trim().toLowerCase();
    clearBtn.style.display = keyword.length > 0 ? 'block' : 'none';

    if (myMarketList && typeof window.setMyMarketSearchKeyword === 'function') {
      window.setMyMarketSearchKeyword(keyword);
      return;
    }
    if (boothList && typeof window.setMyBoothSearchKeyword === 'function') {
      window.setMyBoothSearchKeyword(keyword);
      return;
    }

    const cards = container.children;
    let visibleCount = 0;

    Array.from(cards).forEach(card => {
      if (card.classList.contains('search-empty-text')) return;

      const text = card.textContent.toLowerCase();
      const isMatch = !keyword || text.includes(keyword);

      if (isMatch) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    updateEmptyMessage(container, visibleCount, keyword);
  }

  // 6. 키워드 입력 (검색은 안 하고, 지우기 버튼만 보였다 숨겼다 함)
  //
  // [수정] 예전에는 타이핑할 때마다(300ms 디바운스) 서버 검색 API를 계속 호출해서
  //   서버 부담도 크고 결과가 자꾸 깜빡여서 로딩도 오래 걸리는 느낌이 있었습니다.
  //   이제는 입력 중엔 검색을 실행하지 않고, 검색 버튼을 누르거나(또는 Enter)
  //   지우기(✕) 버튼을 눌렀을 때만 검색/초기화가 실행됩니다.
  inputEl.addEventListener('input', () => {
    const keyword = inputEl.value.trim();
    clearBtn.style.display = keyword.length > 0 ? 'block' : 'none';
  });

  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    clearBtn.style.display = 'none';
    if (isMainPage) {
      fetchSearchResults('');
    } else {
      filterClientSideCards();
    }
    inputEl.focus();
  });

  submitBtn.addEventListener('click', () => {
    const keyword = inputEl.value.trim();
    if (isMainPage) {
      fetchSearchResults(keyword);
    } else {
      filterClientSideCards();
    }
  });

  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      submitBtn.click();
    }
  });

  // 7. 탭(진행 중/모집 중/진행 예정/종료) 전환 시, 검색 중이던 키워드가 있으면 그 탭 기준으로 재검색
  //    (main.js의 탭 클릭 핸들러가 currentTab을 먼저 갱신한 뒤 이 리스너가 실행됨: 같은 버튼에 나중에 등록됐기 때문)
  if (isMainPage) {
    document.querySelectorAll('.status-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const keyword = inputEl.value.trim();
        if (keyword) fetchSearchResults(keyword);
      });
    });

    // 정렬 드롭다운 변경 시에도, 검색 중이던 키워드가 있으면 그 정렬 기준으로 재검색
    document.getElementById('sort-filter')?.addEventListener('change', () => {
      const keyword = inputEl.value.trim();
      if (keyword) fetchSearchResults(keyword);
    });
  }

  // Helper: 직접 카드를 그릴 때
  function renderMarketCardsDirectly(targetContainer, markets) {
    targetContainer.innerHTML = '';
    if (markets.length === 0) {
      targetContainer.innerHTML = `<div class="search-empty-text">검색 결과가 없습니다.</div>`;
      return;
    }
    markets.forEach(m => {
      const card = document.createElement('div');
      card.className = 'market-card';
      card.innerHTML = `
        <h3>${m.title || m.name}</h3>
        <p>${m.description || ''}</p>
        <span>${m.locationName || m.region || ''}</span>
      `;
      targetContainer.appendChild(card);
    });
  }

  // Helper: 빈 결과 처리
  function updateEmptyMessage(targetContainer, count, keyword) {
    let emptyEl = targetContainer.querySelector('.search-empty-text');
    if (count === 0 && keyword !== '') {
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.className = 'search-empty-text';
        emptyEl.style.cssText = 'width:100%; text-align:center; padding:40px 0; color:#888; grid-column: 1 / -1;';
        targetContainer.appendChild(emptyEl);
      }
      emptyEl.textContent = `'${keyword}'에 대한 검색 결과가 없습니다.`;
      emptyEl.style.display = 'block';
    } else if (emptyEl) {
      emptyEl.style.display = 'none';
    }
  }
});