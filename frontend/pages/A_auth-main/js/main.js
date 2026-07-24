// 담당 A: 첫 화면(마켓 목록) - 로그인 없이 접근 가능한 랜딩 페이지
// 실제 백엔드가 떠 있으면 GET /api/markets 를 호출하고,
// 응답이 없으면(백엔드 미실행) 데모용 목데이터로 자동 대체합니다.
//
// ⚠️ 실제 백엔드 응답 필드(backend/controllers/marketController.js 기준):
//    marketId, hostId, title, description, marketImage,
//    locationName, latitude, longitude, eventDate, isExpired,
//    boothPrice, hostRegion(= users.region JOIN)
// 목데이터도 반드시 같은 필드명을 써야 실제 API로 전환했을 때 화면이 안 깨집니다.

// const MOCK_MARKETS = [
//   { marketId: 1, title: "홍대 골목 빈티지 마켓", hostRegion: "마포구", locationName: "서울 마포구 와우산로", eventDate: "2026-07-19", boothPrice: 30000 },
//   { marketId: 2, title: "연남동 주말 플리마켓", hostRegion: "마포구", locationName: "서울 마포구 연남동", eventDate: "2026-07-26", boothPrice: 20000 },
//   { marketId: 3, title: "성수동 브런치 마켓", hostRegion: "성동구", locationName: "서울 성동구 성수동", eventDate: "2026-07-20", boothPrice: 0 },
//   { marketId: 4, title: "판교 테크밸리 나눔장터", hostRegion: "성남시", locationName: "경기 성남시 분당구", eventDate: "2026-08-02", boothPrice: 10000 },
//   { marketId: 5, title: "잠실 한강 야시장", hostRegion: "송파구", locationName: "서울 송파구 잠실동", eventDate: "2026-07-25", boothPrice: 40000 },
//   { marketId: 6, title: "이태원 세계 소품 마켓", hostRegion: "용산구", locationName: "서울 용산구 이태원동", eventDate: "2026-08-09", boothPrice: 25000 },
//   { marketId: 7, title: "익선동 골동품 벼룩시장", hostRegion: "종로구", locationName: "서울 종로구 익선동", eventDate: "2026-07-12", boothPrice: 15000 },
//   { marketId: 8, title: "제주 애월 로컬 마켓", hostRegion: "제주시", locationName: "제주 제주시 애월읍", eventDate: "2026-08-16", boothPrice: 0 },
// ];

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(dateStr) {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diffMs = target - todayMidnight();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function isExpiredByDate(dateStr) {
  return daysUntil(dateStr) < 0;
}

// [추가] 오늘 기준으로 "모집 중" / "진행 중" 상태를 판정합니다.
// 모집 중: recruitmentDate_min ~ recruitmentDate_max 사이 (둘 중 하나라도 없으면 모집중 탭에서는 제외)
// 진행 중: eventDate_min ~ eventDate_max 사이 (행사 당일 포함)
function isRecruitingNow(m) {
  if (!m.recruitmentDate_min || !m.recruitmentDate_max) return false;
  const today = todayMidnight();
  const min = new Date(m.recruitmentDate_min);
  const max = new Date(m.recruitmentDate_max);
  min.setHours(0, 0, 0, 0);
  max.setHours(0, 0, 0, 0);
  return min <= today && today <= max;
}

function isOngoingNow(m) {
  const today = todayMidnight();
  const min = new Date(m.eventDate_min);
  const max = new Date(m.eventDate_max);
  min.setHours(0, 0, 0, 0);
  max.setHours(0, 0, 0, 0);
  return min <= today && today <= max;
}

// [추가] 종료된 행사: 행사 진행 기간(eventDate_max)이 이미 지난 마켓
function isEndedNow(m) {
  return isExpiredByDate(m.eventDate_max);
}

function filterByTab(markets, tab) {
  if (tab === "ongoing") return markets.filter(isOngoingNow);
  if (tab === "ended") return markets.filter(isEndedNow);
  return markets.filter(isRecruitingNow);
}

// [추가] 탭/페이지네이션 상태
const PAGE_SIZE = 9; // 3 x 3
let currentTab = "recruiting"; // 'recruiting' | 'ongoing' | 'ended'
let currentPage = 1;
let lastFetchedMarkets = []; // 지역/정렬만 적용된, 탭 나누기 전의 원본 목록 (탭 전환 시 재요청 방지용)
let currentTabList = []; // 탭까지 적용된 목록 (페이지네이션 대상)

function ddayLabel(m) {
  if (isExpiredByDate(m.eventDate_max)) return "종료";
  const d = daysUntil(m.eventDate_min);
  if (d === 0) return "D-DAY";
  return `D-${d}`;
}

function formatPrice(price) {
  const n = Number(price) || 0;
  return n === 0 ? "무료 참가" : `참가비 ${n.toLocaleString()}원`;
}

// market-detail-extra.js의 renderMarketImage()와 동일한 규칙:
// 절대 URL(http로 시작)이면 그대로, 아니면 백엔드 API_BASE_URL을 붙여서 완성합니다.
function getMarketImageSrc(marketImage) {
  if (!marketImage) return null;
  return marketImage.startsWith("http") ? marketImage : `${API_BASE_URL}${marketImage}`;
}

// 화면의 "마감임박순(deadline)" / "최신등록순(latest)" 옵션 값을
// 백엔드가 이해하는 sort 값(eventDate/latest)으로 변환합니다.
// (docs/api-routes.md 기준: GET /api/markets?sort=latest|eventDate)
function toBackendSort(sort) {
  return sort === "latest" ? "latest" : "eventDate";
}

// 담당 D 백엔드 완성 전(또는 통신 실패 시)에는 목데이터로 자동 대체합니다.
async function getMarketList(params = {}) {
  const { region, sort } = params;
  const backendParams = {};
  if (region) backendParams.region = region;
  backendParams.sort = toBackendSort(sort);
  // [변경] "종료된 행사" 탭도 보여줘야 해서, 마감/진행 여부와 상관없이 항상 전체 목록을 받아옵니다.
  // (삭제된 마켓(isExpired=2)은 백엔드가 항상 걸러줘서 여기엔 안 내려옵니다.)
  // 모집중/진행중/종료 구분은 프론트에서 날짜 기준으로 다시 나눕니다(filterByTab).
  backendParams.includeExpired = "true";

  try {
    const query = new URLSearchParams(backendParams).toString();
    const res = await callApi(`/markets${query ? `?${query}` : ""}`);
    if (res && res.success && Array.isArray(res.data)) {
      MOCK_MARKETS=res.data; // 목데이터를 실제 응답으로 갱신합니다.
      return res.data;
    }
    throw new Error("응답 형식이 올바르지 않음 - 목데이터로 대체");
  } catch (e) {;
    return applyFilterSort(MOCK_MARKETS, { region, sort });
  }
}

function applyFilterSort(markets, { region, sort } = {}) {
  // 삭제된 마켓만 제외하고, 모집중/진행중/종료 구분은 filterByTab에서 처리합니다.
  let list = markets.filter((m) => Number(m.isExpired) !== 2);
  //if (region) list = list.filter((m) => m.hostRegion === region);
  if (region) list = list.filter((m) => m.region === region);
  if (sort === "latest") {
    list = [...list].sort((a, b) => b.marketId - a.marketId);
  } else {
    list = [...list].sort((a, b) => daysUntil(a.eventDate_min.toLocaleDateString()) - daysUntil(b.eventDate_min.toLocaleDateString()));
  }
  return list;
}

function populateRegionOptions(markets) {
  const select = document.getElementById("region-filter");
  if (!select) return;

  const currentValue = select.value;
  // 실제 데이터 기준으로 다시 채워야 하므로, "전체" 옵션만 남기고 초기화합니다.
  select.innerHTML = '<option value="">전체</option>';

  const regions = [...new Set(markets.map((m) => m.region).filter(Boolean))].sort();
  regions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    select.appendChild(opt);
  });

  // 목록을 다시 채우는 동안 사용자가 고른 지역이 여전히 존재하면 유지합니다.
  if (regions.includes(currentValue)) select.value = currentValue;
}


// 탭별 결과 개수 / 빈 상태 문구
const TAB_COUNT_SUFFIX = {
  recruiting: "개 마켓 모집 중",
  ongoing: "개 마켓 진행 중",
  ended: "개 마켓 종료",
};
const TAB_EMPTY_MESSAGE = {
  recruiting: "조건에 맞는 모집 중인 마켓이 없어요. 다른 지역을 선택해 보세요.",
  ongoing: "조건에 맞는 진행 중인 마켓이 없어요. 다른 지역을 선택해 보세요.",
  ended: "조건에 맞는 종료된 마켓이 없어요. 다른 지역을 선택해 보세요.",
};

function renderMarketList(pageMarkets, totalCount) {
  const grid = document.getElementById("market-grid");
  const emptyState = document.getElementById("empty-state");
  const countEl = document.getElementById("result-count");

  countEl.textContent = `${totalCount}${TAB_COUNT_SUFFIX[currentTab] || "개 마켓 진행 예정"}`;

  if (pageMarkets.length === 0) {
    grid.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = TAB_EMPTY_MESSAGE[currentTab] || "조건에 맞는 열려 있는 마켓이 없어요. 다른 지역을 선택해 보세요.";
    return;
  }
  emptyState.hidden = true;

  grid.innerHTML = pageMarkets
    .map((m) => {
      const imageSrc = getMarketImageSrc(m.marketImage);
      return `
      <a class="market-card" href="pages/B_host-seller/market-detail?marketId=${m.marketId}">
        <span class="pin" aria-hidden="true"></span>
        ${imageSrc ? `<div class="card-image-wrap"><img class="card-image" src="${imageSrc}" alt="${m.title} 대표 이미지" loading="lazy" /></div>` : ""}
        <div class="card-top">
          <span class="category-tag">${m.region || ""}</span>
          <span class="dday-tag">${ddayLabel(m)}</span>
        </div>
        <h3>${m.title}</h3>
        <p class="market-meta tight">행사 기간 ${new Date(m.eventDate_min).toLocaleDateString()} ~ ${new Date(m.eventDate_max).toLocaleDateString()}</p>
        <p class="market-meta tight">${m.locationName || ""}</p>
        <p class="market-meta">모집 기간 ${new Date(m.recruitmentDate_min).toLocaleDateString()} ~ ${new Date(m.recruitmentDate_max).toLocaleDateString()}</p>
        <div class="card-bottom">
          <span class="price-tag ${Number(m.boothPrice) === 0 ? "free" : ""}">${formatPrice(m.boothPrice)}</span>
          <span class="card-arrow">자세히 보기 →</span>
        </div>
      </a>`;
    })
    .join("");
}

// 지역/정렬이 바뀌었을 때: API를 다시 불러오고, 현재 탭 기준으로 다시 나눈 뒤 1페이지부터 보여줍니다.
async function handleFilterChange() {
  const region = document.getElementById("region-filter").value;
  const sort = document.getElementById("sort-filter").value;
  lastFetchedMarkets = await getMarketList({ region, sort });
  applyTabAndRender({ resetPage: true });
}

// 탭(모집중/진행중)이 바뀌었을 때: 이미 불러온 목록을 재사용하고, 다시 요청하지 않습니다.
function applyTabAndRender({ resetPage = true } = {}) {
  currentTabList = filterByTab(lastFetchedMarkets, currentTab);
  if (resetPage) currentPage = 1;
  renderCurrentPage();
}

function renderCurrentPage() {
  const totalItems = currentTabList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = currentTabList.slice(start, start + PAGE_SIZE);

  renderMarketList(pageItems, totalItems);
  renderPagination(totalPages);
}

// [추가] 페이지 번호 버튼 렌더링 (이전/다음 + 숫자 버튼)
function renderPagination(totalPages) {
  const nav = document.getElementById("pagination");
  if (!nav) return;

  if (totalPages <= 1) {
    nav.innerHTML = "";
    return;
  }

  const buttons = [];
  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>이전</button>`
  );
  for (let p = 1; p <= totalPages; p++) {
    buttons.push(
      `<button type="button" class="page-btn${p === currentPage ? " is-active" : ""}" data-page="${p}">${p}</button>`
    );
  }
  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>다음</button>`
  );

  nav.innerHTML = buttons.join("");
}

function handlePaginationClick() {
  const nav = document.getElementById("pagination");
  if (!nav) return;
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".page-btn");
    if (!btn || btn.disabled) return;
    const page = Number(btn.dataset.page);
    if (!page || page === currentPage) return;
    currentPage = page;
    renderCurrentPage();
    document.getElementById("market-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function handleStatusTabClick() {
  const tabs = document.querySelectorAll(".status-tab");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === currentTab) return;
      currentTab = tab;
      tabs.forEach((t) => {
        const isActive = t === btn;
        t.classList.toggle("is-active", isActive);
        t.setAttribute("aria-selected", String(isActive));
      });
      applyTabAndRender({ resetPage: true });
    });
  });
}

function getLoggedInUser() {
  const raw = sessionStorage.getItem("loggedInUser");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function syncAuthNavVisibility() {
  const loginLink = document.getElementById("nav-login-link");
  const registerLink = document.getElementById("nav-register-link");
  const mypageLink = document.getElementById("nav-mypage-link");
  const logoutBtn = document.getElementById("nav-logout-btn");
  const hostCtaBtn = document.getElementById("host-cta");
  const hostmarketpageLink = document.getElementById("nav-hostmarket-link");
  const sellerBoothLink = document.getElementById("nav-sellerbooth-link");
  if (!loginLink || !mypageLink || !logoutBtn || !hostCtaBtn || !hostmarketpageLink || !sellerBoothLink) return;

  const user = getLoggedInUser();
  const isLoggedIn = !!user;
  const isHost = user?.userType === 1; // 0: 판매자, 1: 주최자
  const isSeller = user?.userType === 0;

  loginLink.hidden = isLoggedIn;
  if (registerLink) registerLink.hidden = isLoggedIn;
  logoutBtn.hidden = !isLoggedIn;
  mypageLink.hidden = !isLoggedIn;          // 비로그인/판매자/주최자 모두 마이페이지는 숨김
  hostCtaBtn.hidden = !isLoggedIn || !isHost; // 주최자로 로그인했을 때만 노출
  hostmarketpageLink.hidden = !isLoggedIn || !isHost; // 주최자로 로그인했을 때만 노출
  sellerBoothLink.hidden = !isLoggedIn || !isSeller; // 판매자로 로그인했을 때만 노출
}

function initAuthNav() {
  syncAuthNavVisibility();
  const logoutBtn = document.getElementById("nav-logout-btn");
  logoutBtn?.addEventListener("click", async () => {
    await logoutUser();
    syncAuthNavVisibility();
  });
}

function handleHostCtaClick() {
  const btn = document.getElementById("host-cta");
  if (!btn) return;
  btn.addEventListener("click", () => {
    // 로그인이 되어 있으면 바로 마켓 등록 화면으로, 아니면 로그인 화면으로 보냅니다.
    const isLoggedIn = !!sessionStorage.getItem("loggedInUser");
    window.location.href = isLoggedIn
      ? "pages/B_host-seller/market-create.html"
      : "pages/A_auth-main/login.html";
  });
}
function handleHostMarketPageClick() {
  const btn = document.getElementById("nav-hostmarket-link");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const isLoggedIn = !!sessionStorage.getItem("loggedInUser");
    window.location.href = isLoggedIn
      ? "pages/B_host-seller/mymarketpage.html"
      : "pages/A_auth-main/login.html";
  });
}

// [추가] 판매자용 "내 부스 관리" 버튼 - 신청한 부스 목록/수정/취소 페이지로 이동
function handleSellerBoothClick() {
  const btn = document.getElementById("nav-sellerbooth-link");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const isLoggedIn = !!sessionStorage.getItem("loggedInUser");
    window.location.href = isLoggedIn
      ? "pages/B_host-seller/mybooth.html"
      : "pages/A_auth-main/login.html";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("region-filter")?.addEventListener("change", handleFilterChange);
  document.getElementById("sort-filter")?.addEventListener("change", handleFilterChange);
  initAuthNav();
  handleHostCtaClick();
  handleHostMarketPageClick();
  handleSellerBoothClick();
  handleStatusTabClick();
  handlePaginationClick();

  // 지역 옵션은 필터가 걸리지 않은 전체 목록 기준으로 한 번만 채웁니다.
  // (필터링된 목록으로 채우면 지역을 고를수록 선택지가 줄어드는 버그가 생깁니다.)
  const allMarkets = await getMarketList({});
  populateRegionOptions(allMarkets);

  await handleFilterChange();
});
