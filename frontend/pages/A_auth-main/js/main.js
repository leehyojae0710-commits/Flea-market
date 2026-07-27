// 담당 A: 첫 화면(마켓 목록) - 로그인 없이 접근 가능한 랜딩 페이지
// [리디자인] 첨부 시안 스타일(이미지 카드 + 상태 배지 + 진행률 바) 적용.
//   ⚠️ 백엔드 응답 필드는 기존 그대로 사용합니다:
//      marketId, hostId, title, description, marketImage,
//      locationName, region, latitude, longitude,
//      eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max,
//      boothPrice, isExpired, maxparticipants/maxParticipants, appliedBooths
//   이미지가 있을 때/없을 때 모두 데이터가 소실되거나 레이아웃이 깨지지 않도록 처리합니다.

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

// 모집 중: recruitmentDate_min ~ recruitmentDate_max 사이
function isRecruitingNow(m) {
  if (!m.recruitmentDate_min || !m.recruitmentDate_max) return false;
  const today = todayMidnight();
  const min = new Date(m.recruitmentDate_min); min.setHours(0, 0, 0, 0);
  const max = new Date(m.recruitmentDate_max); max.setHours(0, 0, 0, 0);
  return min <= today && today <= max;
}

// 진행 중: eventDate_min ~ eventDate_max 사이 (행사 당일 포함)
function isOngoingNow(m) {
  const today = todayMidnight();
  const min = new Date(m.eventDate_min); min.setHours(0, 0, 0, 0);
  const max = new Date(m.eventDate_max); max.setHours(0, 0, 0, 0);
  return min <= today && today <= max;
}

// 종료된 행사: 행사 진행 기간(eventDate_max)이 이미 지난 마켓
function isEndedNow(m) {
  return isExpiredByDate(m.eventDate_max);
}

// [추가] 진행 예정 행사: 아직 행사 시작일(eventDate_min) 전인 마켓
function isUpcomingNow(m) {
  const today = todayMidnight();
  const min = new Date(m.eventDate_min);
  min.setHours(0, 0, 0, 0);
  return today < min;
}

function filterByTab(markets, tab) {
  if (tab === "ongoing") return markets.filter(isOngoingNow);
  if (tab === "upcoming") return markets.filter(isUpcomingNow);
  if (tab === "ended") return markets.filter(isEndedNow);
  return markets.filter(isRecruitingNow);
}

// [상태/페이지네이션]
const PAGE_SIZE = 9; // 3 x 3
let currentTab = "recruiting"; // 'recruiting' | 'ongoing' | 'upcoming' | 'ended'
let currentPage = 1;
let lastFetchedMarkets = [];
let currentTabList = [];

// [통일] 카드 하나의 상태를 하나의 기준으로만 판정
// 우선순위: 종료 > 모집 중(모집 기간 안) > 행사 중(행사 기간 안) > 진행 예정(그 외, 행사 시작 전)
function getMarketStatus(m) {
  if (isEndedNow(m)) return "ended";
  if (isRecruitingNow(m)) return "recruiting";
  if (isOngoingNow(m)) return "ongoing";
  return "upcoming";
}

// [통일] D-day는 상태별로 "그 상태가 끝나는 기준일"까지 남은 일수
// - 모집 중: 모집 마지막날(recruitmentDate_max)까지
// - 행사 중: 행사 마지막날(eventDate_max)까지
// - 진행 예정: 행사 시작날(eventDate_min)까지
// - 종료: 표시하지 않음
function ddayLabel(m, status) {
  if (status === "ended") return null;
  if (status === "recruiting") {
    const d = daysUntil(m.recruitmentDate_max);
    if (d <= 0) return "오늘 마감";
    return `마감 D-${d}`;
  }
  if (status === "ongoing") {
    const d = daysUntil(m.eventDate_max);
    if (d <= 0) return "오늘 마감";
    return `마감 D-${d}`;
  }
  const d = daysUntil(m.eventDate_min);
  if (d <= 0) return "D-DAY";
  return `D-${d}`;
}

function formatPrice(price) {
  const n = Number(price) || 0;
  return n === 0 ? "무료 참가" : `참가비 ${n.toLocaleString()}원`;
}

/* ============================================================
   [참가비 변경 표시] - 프론트(localStorage)로 "기존 금액" 보존
   - 각 마켓의 boothPrice를 처음 볼 때 원가(originalPrice)로 기억.
   - 이후 boothPrice가 바뀌면 원가와 비교해 기존금액 → 변경금액,
     변동률(%), 방향(↓ 인하 / ↑ 인상)을 시안처럼 표시.
   - 원가는 지워지지 않고 계속 유지됨.
   ============================================================ */
const FLEA_PRICE_KEY = "flea_original_prices";

function loadOriginalPrices() {
  try { return JSON.parse(localStorage.getItem(FLEA_PRICE_KEY)) || {}; }
  catch { return {}; }
}
function saveOriginalPrices(map) {
  try { localStorage.setItem(FLEA_PRICE_KEY, JSON.stringify(map)); } catch { /* 저장 실패 무시 */ }
}

// 마켓의 "기존 금액"을 반환. 없으면 현재 금액을 원가로 기억한 뒤 반환(원가는 이후 유지).
function getOriginalPrice(m) {
  const id = String(m.marketId);
  const current = Number(m.boothPrice) || 0;
  const map = loadOriginalPrices();
  if (map[id] === undefined || map[id] === null) {
    map[id] = current;          // 최초 관측 시 원가로 확정
    saveOriginalPrices(map);
    return current;
  }
  return Number(map[id]) || 0;
}

// (선택) 원가를 강제로 다시 기준값으로 설정하고 싶을 때 사용.
window.fleaResetOriginalPrice = function (marketId, price) {
  const map = loadOriginalPrices();
  map[String(marketId)] = Number(price) || 0;
  saveOriginalPrices(map);
};

// 원가 대비 현재가의 변동 정보 계산
function getPriceChange(m) {
  const original = getOriginalPrice(m);
  const current = Number(m.boothPrice) || 0;
  const diff = current - original;
  let direction = "same";
  if (diff < 0) direction = "down";
  else if (diff > 0) direction = "up";
  const pct = original > 0 ? Math.round(Math.abs(diff) / original * 100) : 0;
  return { original, current, diff, direction, pct };
}

// [참가비 블록] 시안 스타일: 기존 금액 → 변경 금액 + 변동률 배지 + 안내문
function renderPriceBlock(m) {
  const { original, current, direction, pct } = getPriceChange(m);
  const isFree = current === 0;

  // 무료 참가
  if (isFree) {
    return `
      <div class="price-block free">
        <div class="price-block-title">참가비</div>
        <div class="price-free-row">
          <span class="price-free-mark">₩</span>
          <span class="price-free-text">무료 참가</span>
        </div>
        <div class="price-note ok">✔ 참가비가 무료예요!</div>
      </div>`;
  }

  // 변동 없음: 기존 = 변경
  if (direction === "same") {
    return `
      <div class="price-block">
        <div class="price-block-title">참가비</div>
        <div class="price-row">
          <span class="price-current">${current.toLocaleString()}원</span>
        </div>
      </div>`;
  }

  // 인하 / 인상
  const dirClass = direction === "down" ? "down" : "up";
  const arrow = direction === "down" ? "↓" : "↑";
  const diffAbs = Math.abs(current - original).toLocaleString();
  const note = direction === "down"
    ? `참가비가 ${diffAbs}원 낮아졌어요!`
    : `참가비가 ${diffAbs}원 올랐어요!`;

  return `
    <div class="price-block ${dirClass}">
      <div class="price-block-title">참가비</div>
      <div class="price-row">
        <span class="price-old">
          <s>${original.toLocaleString()}원</s>
          <em>(기존 금액)</em>
        </span>
        <span class="price-arrow-sep">→</span>
        <span class="price-new">
          <strong>${current.toLocaleString()}원</strong>
          <em>(변경 금액)</em>
        </span>
        <span class="price-rate ${dirClass}">${arrow} ${pct}%</span>
      </div>
      <div class="price-note ${dirClass}">${arrow} ${note}</div>
    </div>`;
}

// 부스 신청 현황: 신청 부스 수 / 총 부스 수 와 참여 비율(%)
function getBoothStats(m) {
  const total = Number(m.maxparticipants ?? m.maxParticipants) || 0;
  const applied = Number(m.appliedBooths) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((applied / total) * 100)) : 0;
  return { applied, total, pct };
}

function boothLevel(pct) {
  if (pct >= 80) return "high";  // 마감 임박
  if (pct >= 50) return "mid";   // 보통
  return "low";                  // 여유
}

// [리디자인] 카드 하단 진행률 바 (퍼센트 + 신청/총 부스 수)
function renderBoothGauge(m) {
  const { applied, total, pct } = getBoothStats(m);
  if (total === 0) return "";
  const level = boothLevel(pct);
  return `
    <div class="booth-gauge" data-level="${level}">
      <div class="booth-gauge-head">
        <span class="booth-gauge-pct">${pct}%</span>
      </div>
      <div class="booth-gauge-track" role="progressbar"
           aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
           aria-label="부스 신청률 ${pct}%">
        <div class="booth-gauge-fill" style="width:${pct}%"></div>
      </div>
      <div class="booth-gauge-foot">
        <span class="booth-gauge-count"><strong>${applied}</strong> / ${total} 부스 모집</span>
      </div>
    </div>`;
}

// [리디자인] 상태 배지 (모집중 / 마감임박 / 행사중 / 진행예정 / 종료) - getMarketStatus 하나로 통일
function renderStatusBadge(status, m) {
  if (status === "ended") return `<span class="status-badge ended">종료</span>`;
  if (status === "recruiting") {
    const { pct } = getBoothStats(m);
    if (pct >= 80) return `<span class="status-badge closing">마감 임박</span>`;
    return `<span class="status-badge recruiting">모집 중</span>`;
  }
  if (status === "ongoing") return `<span class="status-badge ongoing">행사 중</span>`;
  // upcoming: 배지 없이 D-day만 표시
  return "";
}

// 절대 URL(http로 시작)이면 그대로, 아니면 백엔드 API_BASE_URL을 붙임
function getMarketImageSrc(marketImage) {
  if (!marketImage) return null;
  return marketImage.startsWith("http") ? marketImage : `${API_BASE_URL}${marketImage}`;
}

// marketId -> market 원본 데이터 매핑 (이미지 onerror 시 배지를 다시 그리기 위해 필요)
window.__fleaMarketMap = window.__fleaMarketMap || {};

// 이미지가 없을 때 쓸 대체 배너 (제목 첫 글자를 크게 노출 → 데이터 소실 없이 자연스럽게)
function renderCardVisual(m, imageSrc) {
  const safeTitle = (m.title || "플리마켓").replace(/"/g, "&quot;");
  if (imageSrc) {
    // onerror에서 배지를 다시 그릴 수 있도록 marketId로 원본 데이터를 찾아옴
    window.__fleaMarketMap[m.marketId] = m;
    // onerror: 깨진 이미지 URL일 때 자동으로 대체 배너로 폴백 (배지도 함께 복원)
    return `
      <div class="card-image-wrap">
        <img class="card-image" src="${imageSrc}" alt="${safeTitle} 대표 이미지"
             loading="lazy"
             onerror="this.closest('.card-image-wrap').outerHTML = window.__fleaFallback('${m.marketId}', '${safeTitle}');" />
        ${renderCardBadges(m)}
      </div>`;
  }
  return renderFallbackVisual(m, safeTitle);
}

function renderFallbackVisual(m, safeTitle) {
  return `
    <div class="card-image-fallback">
      <div class="fb-inner">
        <span class="fb-emoji">🛍️</span>
        <span>${(m.region || m.title || "플리마켓")}</span>
      </div>
      ${renderCardBadges(m)}
    </div>`;
}

// 이미지 로드 실패 시 onerror에서 호출 (marketId로 원본 데이터를 찾아 배지까지 그대로 복원)
window.__fleaFallback = function (marketId, safeTitle) {
  const m = window.__fleaMarketMap[marketId];
  if (m) return renderFallbackVisual(m, safeTitle);
  // 원본 데이터를 못 찾은 경우에만 배지 없이 순수 배너로 폴백
  return `
    <div class="card-image-fallback">
      <div class="fb-inner">
        <span class="fb-emoji">🛍️</span>
        <span>${safeTitle}</span>
      </div>
    </div>`;
};

function renderCardBadges(m) {
  const status = getMarketStatus(m);
  const dday = ddayLabel(m, status);
  return `
    <div class="card-badges">
      ${renderStatusBadge(status, m)}
      ${dday ? `<span class="dday-badge">${dday}</span>` : ""}
    </div>`;
}

function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString();
}

function toBackendSort(sort) {
  return sort === "latest" ? "latest" : "eventDate";
}

async function getMarketList(params = {}) {
  const { region, sort } = params;
  const backendParams = {};
  if (region) backendParams.region = region;
  backendParams.sort = toBackendSort(sort);
  backendParams.includeExpired = "true";

  try {
    const query = new URLSearchParams(backendParams).toString();
    const res = await callApi(`/markets${query ? `?${query}` : ""}`);
    if (res && res.success && Array.isArray(res.data)) {
      return res.data;
    }
    throw new Error("응답 형식이 올바르지 않음");
  } catch (e) {
    // 백엔드 미실행/실패 시 빈 목록 (목데이터를 쓰던 기존 동작과 동일하게 안전 처리)
    return applyFilterSort(Array.isArray(lastFetchedMarkets) ? lastFetchedMarkets : [], { region, sort });
  }
}

function applyFilterSort(markets, { region, sort } = {}) {
  let list = markets.filter((m) => Number(m.isExpired) !== 2);
  if (region) list = list.filter((m) => m.region === region);
  if (sort === "latest") {
    list = [...list].sort((a, b) => b.marketId - a.marketId);
  } else {
    list = [...list].sort(
      (a, b) => daysUntil(a.eventDate_min) - daysUntil(b.eventDate_min)
    );
  }
  return list;
}

function populateRegionOptions(markets) {
  const select = document.getElementById("region-filter");
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = '<option value="">전체</option>';
  const regions = [...new Set(markets.map((m) => m.region).filter(Boolean))].sort();
  regions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    select.appendChild(opt);
  });
  if (regions.includes(currentValue)) select.value = currentValue;
}

const TAB_COUNT_SUFFIX = {
  recruiting: "개 마켓 모집 중",
  ongoing: "개 마켓 진행 중",
  upcoming: "개 마켓 진행 예정",
  ended: "개 마켓 종료",
};
const TAB_EMPTY_MESSAGE = {
  recruiting: "조건에 맞는 모집 중인 마켓이 없어요. 다른 지역을 선택해 보세요.",
  ongoing: "조건에 맞는 진행 중인 마켓이 없어요. 다른 지역을 선택해 보세요.",
  upcoming: "조건에 맞는 진행 예정인 마켓이 없어요. 다른 지역을 선택해 보세요.",
  ended: "조건에 맞는 종료된 마켓이 없어요. 다른 지역을 선택해 보세요.",
};

function renderMarketList(pageMarkets, totalCount) {
  const grid = document.getElementById("market-grid");
  const emptyState = document.getElementById("empty-state");
  const countEl = document.getElementById("result-count");

  if (countEl) countEl.textContent = `총 ${totalCount}${TAB_COUNT_SUFFIX[currentTab] || "개 마켓"}`;

  if (pageMarkets.length === 0) {
    grid.innerHTML = "";
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.textContent =
        TAB_EMPTY_MESSAGE[currentTab] || "조건에 맞는 마켓이 없어요.";
    }
    return;
  }
  if (emptyState) emptyState.hidden = true;

  grid.innerHTML = pageMarkets
    .map((m) => {
      const imageSrc = getMarketImageSrc(m.marketImage);
      const regionChip = m.region
        ? `<span class="chip region">${m.region}</span>`
        : "";
      return `
      <a class="market-card" href="pages/B_host-seller/market-detail?marketId=${m.marketId}">
        <span class="pin" aria-hidden="true"></span>
        ${renderCardVisual(m, imageSrc)}
        <div class="card-body">
          <h3>${m.title || "이름 없는 마켓"}</h3>
          <div class="card-tags">${regionChip}</div>

          <div class="card-meta-grid">
            <div class="meta-item">
              <span class="m-ico">📅</span>
              <span class="m-body">
                <span class="m-label">행사 기간</span>
                <span class="m-value">${fmtDate(m.eventDate_min)} ~ ${fmtDate(m.eventDate_max)}</span>
              </span>
            </div>
            <div class="meta-item">
              <span class="m-ico">🗓️</span>
              <span class="m-body">
                <span class="m-label">모집 기간</span>
                <span class="m-value">${fmtDate(m.recruitmentDate_min)} ~ ${fmtDate(m.recruitmentDate_max)}</span>
              </span>
            </div>
            <div class="meta-item full">
              <span class="m-ico">📍</span>
              <span class="m-body">
                <span class="m-value">${m.locationName || "장소 미정"}</span>
              </span>
            </div>
          </div>

          ${renderBoothGauge(m)}

          ${renderPriceBlock(m)}

          <div class="card-footer">
            <span class="card-arrow">상세보기 →</span>
          </div>
        </div>
      </a>`;
    })
    .join("");
}

async function handleFilterChange() {
  const region = document.getElementById("region-filter")?.value || "";
  const sort = document.getElementById("sort-filter")?.value || "deadline";
  lastFetchedMarkets = await getMarketList({ region, sort });
  applyTabAndRender({ resetPage: true });
}

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

function renderPagination(totalPages) {
  const nav = document.getElementById("pagination");
  if (!nav) return;
  if (totalPages <= 1) { nav.innerHTML = ""; return; }

  const buttons = [];
  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>‹</button>`
  );

  // 표시할 페이지 번호를 축약해서 계산합니다: 1 … (현재 주변) … 마지막
  // 항상 첫 페이지/마지막 페이지 + 현재 페이지 양옆 2개까지 보여줍니다.
  const pages = getPageWindow(currentPage, totalPages);
  pages.forEach((p) => {
    if (p === "…") {
      buttons.push(`<span class="page-ellipsis">…</span>`);
    } else {
      buttons.push(
        `<button type="button" class="page-btn${p === currentPage ? " is-active" : ""}" data-page="${p}">${p}</button>`
      );
    }
  });

  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>›</button>`
  );
  nav.innerHTML = buttons.join("");
}

// 현재 페이지 기준으로 보여줄 페이지 번호 목록을 만듭니다.
// 예) 현재 1/총 20 → [1,2,3,4,5,"…",20]
//     현재 10/총 20 → [1,"…",8,9,10,11,12,"…",20]
//     현재 19/총 20 → [1,"…",16,17,18,19,20]
function getPageWindow(current, total) {
  const SIBLINGS = 2; // 현재 페이지 양옆으로 보여줄 개수
  const first = 1;
  const last = total;

  // 페이지가 적으면(약 7개 이하) 그냥 전부 보여줍니다.
  if (total <= SIBLINGS * 2 + 3) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const start = Math.max(current - SIBLINGS, first);
  const end = Math.min(current + SIBLINGS, last);
  const pages = [];

  pages.push(first);
  if (start > first + 1) pages.push("…"); // 첫 페이지와 start 사이가 벌어지면 …
  else if (start === first + 1) pages.push(first + 1); // 딱 한 칸 차이면 숫자로 채움

  for (let p = start; p <= end; p++) {
    if (p !== first && p !== last) pages.push(p);
  }

  if (end < last - 1) pages.push("…");
  else if (end === last - 1) pages.push(last - 1);

  pages.push(last);

  // 혹시 모를 중복 제거(경계값에서 안전하게)
  return pages.filter((p, i) => p === "…" || pages.indexOf(p) === i);
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
  try { return JSON.parse(raw); } catch { return null; }
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
  const isHost = user?.userType === 1;
  const isSeller = user?.userType === 0;

  loginLink.hidden = isLoggedIn;
  if (registerLink) registerLink.hidden = isLoggedIn;
  logoutBtn.hidden = !isLoggedIn;
  mypageLink.hidden = !isLoggedIn;
  hostCtaBtn.hidden = !isLoggedIn || !isHost;
  hostmarketpageLink.hidden = !isLoggedIn || !isHost;
  sellerBoothLink.hidden = !isLoggedIn || !isSeller;
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

  // 지역 옵션은 전체 목록 기준으로 한 번만 채움
  const allMarkets = await getMarketList({});
  lastFetchedMarkets = allMarkets;
  populateRegionOptions(allMarkets);

  // 지도/지역 목록 렌더 (전체 목록 기준 지역별 개수 표시)
  if (window.RegionMap) window.RegionMap.render(allMarkets);

  await handleFilterChange();
});
