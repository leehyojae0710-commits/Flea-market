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

function ddayLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === 0) return "D-DAY";
  return `D-${d}`;
}

function formatPrice(price) {
  const n = Number(price) || 0;
  return n === 0 ? "무료 참가" : `참가비 ${n.toLocaleString()}원`;
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

  try {
    const query = new URLSearchParams(backendParams).toString();
    const res = await callApi(`/markets${query ? `?${query}` : ""}`);
    if (res && res.success && Array.isArray(res.data)) {
      return res.data;
    }
    throw new Error("응답 형식이 올바르지 않음 - 목데이터로 대체");
  } catch (e) {
    return applyFilterSort(MOCK_MARKETS, { region, sort });
  }
}

function applyFilterSort(markets, { region, sort } = {}) {
  let list = markets.filter((m) => !m.isExpired && !isExpiredByDate(m.eventDate_max));
  if (region) list = list.filter((m) => m.hostRegion === region);
  if (sort === "latest") {
    list = [...list].sort((a, b) => b.marketId - a.marketId);
  } else {
    list = [...list].sort((a, b) => daysUntil(a.eventDate_min) - daysUntil(b.eventDate_min));
  }
  return list;
}

function populateRegionOptions(markets) {
  const select = document.getElementById("region-filter");
  if (!select) return;

  const currentValue = select.value;
  // 실제 데이터 기준으로 다시 채워야 하므로, "전체" 옵션만 남기고 초기화합니다.
  select.innerHTML = '<option value="">전체</option>';

  const regions = [...new Set(markets.map((m) => m.hostRegion).filter(Boolean))].sort();
  regions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    select.appendChild(opt);
  });

  // 목록을 다시 채우는 동안 사용자가 고른 지역이 여전히 존재하면 유지합니다.
  if (regions.includes(currentValue)) select.value = currentValue;
}

function renderMarketList(markets) {
  const grid = document.getElementById("market-grid");
  const emptyState = document.getElementById("empty-state");
  const countEl = document.getElementById("result-count");

  countEl.textContent = `${markets.length}개 마켓 진행 예정`;

  if (markets.length === 0) {
    grid.innerHTML = "";
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  grid.innerHTML = markets
    .map(
      (m) => `
      <a class="market-card" href="pages/B_host-seller/market-detail.html?marketId=${m.marketId}">
        <span class="pin" aria-hidden="true"></span>
        <div class="card-top">
          <span class="category-tag">${m.hostRegion || ""}</span>
          <span class="dday-tag">${ddayLabel(m.eventDate_min)}</span>
        </div>
        <h3>${m.title}</h3>
        <p class="market-meta">${m.eventDate_min} ~ ${m.eventDate_max} · ${m.locationName || ""}</p>
        <div class="card-bottom">
          <span class="price-tag ${Number(m.boothPrice) === 0 ? "free" : ""}">${formatPrice(m.boothPrice)}</span>
          <span class="card-arrow">자세히 보기 →</span>
        </div>
      </a>`
    )
    .join("");
}

async function handleFilterChange() {
  const region = document.getElementById("region-filter").value;
  const sort = document.getElementById("sort-filter").value;
  const markets = await getMarketList({ region, sort });
  renderMarketList(markets);
}

function getLoggedInUser() {
  const raw = localStorage.getItem("loggedInUser");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function syncAuthNavVisibility() {
  const loginLink = document.getElementById("nav-login-link");
  const mypageLink = document.getElementById("nav-mypage-link");
  const logoutBtn = document.getElementById("nav-logout-btn");
  const hostCtaBtn = document.getElementById("host-cta");
  if (!loginLink || !mypageLink || !logoutBtn || !hostCtaBtn) return;

  const user = getLoggedInUser();
  const isLoggedIn = !!user;
  const isHost = user?.userType === 1; // 0: 판매자, 1: 주최자

  loginLink.hidden = isLoggedIn;
  logoutBtn.hidden = !isLoggedIn;
  mypageLink.hidden = !isLoggedIn;          // 비로그인/판매자/주최자 모두 마이페이지는 숨김
  hostCtaBtn.hidden = !isLoggedIn || !isHost; // 주최자로 로그인했을 때만 노출
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
    const isLoggedIn = !!localStorage.getItem("loggedInUser");
    window.location.href = isLoggedIn
      ? "pages/B_host-seller/market-create.html"
      : "pages/A_auth-main/login.html";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("region-filter")?.addEventListener("change", handleFilterChange);
  document.getElementById("sort-filter")?.addEventListener("change", handleFilterChange);
  initAuthNav();
  handleHostCtaClick();

  // 지역 옵션은 필터가 걸리지 않은 전체 목록 기준으로 한 번만 채웁니다.
  // (필터링된 목록으로 채우면 지역을 고를수록 선택지가 줄어드는 버그가 생깁니다.)
  const allMarkets = await getMarketList({});
  populateRegionOptions(allMarkets);

  await handleFilterChange();
});
