// 담당 A: 첫 화면(마켓 목록) - 로그인 없이 접근 가능한 랜딩 페이지
// 실제 백엔드가 떠 있으면 GET /api/markets 를 호출하고,
// 응답이 없으면(백엔드 미실행) 데모용 목데이터로 자동 대체합니다.

const MOCK_MARKETS = [
  { id: 1, title: "홍대 골목 빈티지 마켓", region: "마포구", address: "서울 마포구 와우산로", eventDate: "2026-07-19", boothPrice: 30000, category: "빈티지" },
  { id: 2, title: "연남동 주말 플리마켓", region: "마포구", address: "서울 마포구 연남동", eventDate: "2026-07-26", boothPrice: 20000, category: "핸드메이드" },
  { id: 3, title: "성수동 브런치 마켓", region: "성동구", address: "서울 성동구 성수동", eventDate: "2026-07-20", boothPrice: 0, category: "푸드" },
  { id: 4, title: "판교 테크밸리 나눔장터", region: "성남시", address: "경기 성남시 분당구", eventDate: "2026-08-02", boothPrice: 10000, category: "잡화" },
  { id: 5, title: "잠실 한강 야시장", region: "송파구", address: "서울 송파구 잠실동", eventDate: "2026-07-25", boothPrice: 40000, category: "푸드" },
  { id: 6, title: "이태원 세계 소품 마켓", region: "용산구", address: "서울 용산구 이태원동", eventDate: "2026-08-09", boothPrice: 25000, category: "소품" },
  { id: 7, title: "익선동 골동품 벼룩시장", region: "종로구", address: "서울 종로구 익선동", eventDate: "2026-07-12", boothPrice: 15000, category: "빈티지" },
  { id: 8, title: "제주 애월 로컬 마켓", region: "제주시", address: "제주 제주시 애월읍", eventDate: "2026-08-16", boothPrice: 0, category: "로컬" },
];

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

function isExpired(dateStr) {
  return daysUntil(dateStr) < 0;
}

function ddayLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === 0) return "D-DAY";
  return `D-${d}`;
}

function formatPrice(price) {
  return price === 0 ? "무료 참가" : `참가비 ${price.toLocaleString()}원`;
}

// 담당 D 백엔드 완성 전에는 실패하고, 그 경우 목데이터로 자동 대체합니다.
async function getMarketList(params = {}) {
  try {
    const query = new URLSearchParams(params).toString();
    const res = await callApi(`/markets${query ? `?${query}` : ""}`);
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
    throw new Error("빈 응답 - 목데이터로 대체");
  } catch (e) {
    return applyFilterSort(MOCK_MARKETS, params);
  }
}

function applyFilterSort(markets, { region, sort } = {}) {
  let list = markets.filter((m) => !isExpired(m.eventDate));
  if (region) list = list.filter((m) => m.region === region);
  if (sort === "latest") {
    list = [...list].sort((a, b) => b.id - a.id);
  } else {
    list = [...list].sort((a, b) => daysUntil(a.eventDate) - daysUntil(b.eventDate));
  }
  return list;
}

function populateRegionOptions(markets) {
  const select = document.getElementById("region-filter");
  const regions = [...new Set(markets.map((m) => m.region))].sort();
  regions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    select.appendChild(opt);
  });
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
      <a class="market-card" href="pages/B_host-seller/market-detail.html?marketId=${m.id}">
        <span class="pin" aria-hidden="true"></span>
        <div class="card-top">
          <span class="category-tag">${m.category}</span>
          <span class="dday-tag">${ddayLabel(m.eventDate)}</span>
        </div>
        <h3>${m.title}</h3>
        <p class="market-meta">${m.eventDate} · ${m.address}</p>
        <div class="card-bottom">
          <span class="price-tag ${m.boothPrice === 0 ? "free" : ""}">${formatPrice(m.boothPrice)}</span>
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

function syncAuthNavVisibility() {
  const loginLink = document.getElementById("nav-login-link");
  const mypageLink = document.getElementById("nav-mypage-link");
  const logoutBtn = document.getElementById("nav-logout-btn");
  if (!loginLink || !mypageLink || !logoutBtn) return;

  const isLoggedIn = !!localStorage.getItem("loggedInUser");
  loginLink.hidden = isLoggedIn;
  mypageLink.hidden = !isLoggedIn;
  logoutBtn.hidden = !isLoggedIn;
}

function initAuthNav() {
  syncAuthNavVisibility();
  const logoutBtn = document.getElementById("nav-logout-btn");
  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("loggedInUser");
    syncAuthNavVisibility();
  });
}

function handleHostCtaClick() {
  const btn = document.getElementById("host-cta");
  if (!btn) return;
  btn.addEventListener("click", () => {
    // 로그인 여부는 담당 C의 세션/토큰 체크 로직 완성 후 연결합니다.
    // 지금은 항상 로그인 페이지로 안내합니다.
    window.location.href = "pages/A_auth-main/login.html";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  populateRegionOptions(MOCK_MARKETS);
  document.getElementById("region-filter")?.addEventListener("change", handleFilterChange);
  document.getElementById("sort-filter")?.addEventListener("change", handleFilterChange);
  initAuthNav();
  handleHostCtaClick();
  await handleFilterChange();
});
