// 담당 B: 주최자 화면 - 내 마켓 관리
// [수정] 토글(펼치기/접기) 시 renderMarketList() 전체 재실행 대신,
//        해당 카드의 상세 영역만 부분 업데이트하도록 변경 (성능/버벅임 개선)
// [추가 07-28] H-01 잔여작업 - 모집 / 개최 D-DAY 표기를 주최자 화면에도 적용.
//        · D-DAY 산정 기준은 첫 화면(A_auth-main/js/main.js)의 ddayLabel() 규칙과 동일하게 맞춤
//        · 상태태그(status-tag)는 DB의 isExpired 값 기준, D-DAY는 날짜 기준으로 각각 계산
//        · 취소된 마켓(isExpired=2)은 D-DAY를 표기하지 않음
// [추가 07-28] H-02 정렬 필터(모집마감순/지역순/개최순) 적용.
//        · 정렬은 서버(GET /markets/mine?sort=)에서 DB ORDER BY 로 처리 (메인 목록과 동일 방식)
//        · 백엔드가 아직 갱신되지 않은 환경에서도 화면 순서가 맞도록 클라이언트 정렬을 안전망으로 함께 적용
//        · 취소된 마켓은 어떤 정렬에서도 항상 목록 맨 아래

// ---------- API 호출 ----------

async function deleteMarket(marketId) {
  return callApi(`/markets/closed/${marketId}`, { method: 'PATCH' });
}

async function getMyMarkets(sort = '') {
  const query = sort ? `?sort=${encodeURIComponent(sort)}` : '';
  return callApi(`/markets/mine${query}`);
}

// ---------- 화면 피드백 유틸 ----------

function renderAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('alert-error', 'alert-success');
  box.classList.add(
    type === 'success' ? 'alert-success' : 'alert-error',
    'show',
  );
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.classList.remove('show');
}

const STATUS_LABEL = { open: '모집중', closed: '마감', cancel: '취소됨' };

// [추가] 제목/소개에 <, > 같은 문자가 들어와도 카드 레이아웃이 깨지지 않도록 이스케이프
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// [추가] 기간 표기 (한쪽만 있거나 둘 다 없을 때도 깨지지 않게)
function formatDateRange(from, to) {
  const a = formatDate(from);
  const b = formatDate(to);
  if (!a && !b) return '미정';
  if (a && b) return `${a} ~ ${b}`;
  return a || b;
}

function getStatusKey(isExpired) {
  switch (isExpired) {
    case 0:
      return 'open';
    case 1:
      return 'closed';
    case 2:
      return 'cancel';
    default:
      return 'open';
  }
}

// ---------- 날짜 / D-DAY 계산 ----------

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// 오늘 00:00 기준으로 target 날짜까지 남은 일수 (지났으면 음수)
function daysUntil(dateString) {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  return Math.round((target - todayMidnight()) / (1000 * 60 * 60 * 24));
}

// 모집 D-DAY
//  - 모집 시작 전 : 모집 시작 D-n
//  - 모집 중      : 모집 마감 D-n (당일이면 오늘 마감)
//  - 모집 종료 후 : 모집 마감
function getRecruitDDay(market) {
  const toStart = daysUntil(market.recruitmentDate_min);
  const toEnd = daysUntil(market.recruitmentDate_max);
  if (toStart === null && toEnd === null) return null;

  if (toStart !== null && toStart > 0) {
    return { state: 'before', label: `모집 시작 D-${toStart}` };
  }
  if (toEnd !== null && toEnd > 0) {
    return { state: 'active', label: `모집 마감 D-${toEnd}` };
  }
  if (toEnd === 0) {
    return { state: 'active', label: '모집 오늘 마감' };
  }
  return { state: 'done', label: '모집 마감' };
}

// 개최 D-DAY
//  - 개최 전   : 개최 D-n
//  - 개최 기간 : 개최 D-DAY / 개최중 · 종료 D-n
//  - 개최 후   : 개최 종료
function getEventDDay(market) {
  const toStart = daysUntil(market.eventDate_min);
  const toEnd = daysUntil(market.eventDate_max);
  if (toStart === null && toEnd === null) return null;

  if (toStart !== null && toStart > 0) {
    return { state: 'before', label: `개최 D-${toStart}` };
  }
  if (toStart === 0) {
    return { state: 'active', label: '개최 D-DAY' };
  }
  if (toEnd !== null && toEnd > 0) {
    return { state: 'active', label: `개최중 · 종료 D-${toEnd}` };
  }
  if (toEnd === 0) {
    return { state: 'active', label: '개최 오늘 마지막 날' };
  }
  return { state: 'done', label: '개최 종료' };
}

// 카드 한 행에 모집 / 개최 D-DAY 배지를 나란히 표기
function renderDDayBadges(market, statusKey) {
  if (statusKey === 'cancel') return ''; // 취소된 마켓은 D-DAY 무의미

  const badges = [getRecruitDDay(market), getEventDDay(market)]
    .filter(Boolean)
    .map(
      (d) =>
        `<span class="hm-dday" data-state="${d.state}">${escapeHtml(d.label)}</span>`,
    )
    .join('');

  return badges ? `<div class="hm-dday-row">${badges}</div>` : '';
}

// ---------- 상태 ----------

let allMarkets = [];
let myMarkets = [];
// [수정] 사용자 기준 필터: 주최자가 열었을 때 가장 먼저 필요한 건 "지금 관리해야 할" 마켓이므로
//        기본값을 마감 전(모집중, isExpired=0) 마켓만 보이도록 'open'으로 둡니다.
//        마감/취소된 마켓은 상태 필터에서 언제든 다시 선택해서 볼 수 있습니다.
let statusFilter = 'open';
let sortOption = ''; // '' | 'recruitEnd' | 'region' | 'eventDate'
let expandedId = null; // 상세정보가 펼쳐진 마켓 id
// [수정] 검색 키워드. search.js 가 window.setMyMarketSearchKeyword() 로 넘겨줍니다.
// (예전에는 search.js가 현재 화면에 그려진 카드(children)만 텍스트로 훑었는데,
//  페이지네이션이 생긴 뒤로는 한 페이지에 5건만 DOM에 있어서 나머지 페이지에 있는
//  마켓은 검색해도 못 찾는 문제가 있었습니다. 그래서 원본 데이터(allMarkets)를
//  직접 필터링하도록 바꿨습니다.)
let searchKeyword = '';

// ---------- 페이지네이션 ----------
const PAGE_SIZE = 20;
let currentPage = 1;

// ---------- 정렬 (클라이언트 안전망) ----------

// 날짜 문자열 -> 정렬용 숫자. 값이 없으면 Infinity 로 두어 항상 뒤로 밀림
function sortableTime(dateString) {
  if (!dateString) return Infinity;
  const t = new Date(dateString).getTime();
  return Number.isNaN(t) ? Infinity : t;
}

// 서버(MY_MARKET_SORT_CLAUSES)와 동일한 기준
const SORT_COMPARATORS = {
  // 모집마감순: 모집 마감일이 가까운 순
  recruitEnd: (a, b) =>
    sortableTime(a.recruitmentDate_max) - sortableTime(b.recruitmentDate_max) ||
    Number(b.marketId) - Number(a.marketId),
  // 지역순: 지역 가나다순, 같은 지역이면 개최일이 빠른 순
  region: (a, b) =>
    String(a.region || '').localeCompare(String(b.region || ''), 'ko') ||
    sortableTime(a.eventDate_min) - sortableTime(b.eventDate_min) ||
    Number(b.marketId) - Number(a.marketId),
  // 개최순: 개최일이 가까운 순
  eventDate: (a, b) =>
    sortableTime(a.eventDate_min) - sortableTime(b.eventDate_min) ||
    Number(b.marketId) - Number(a.marketId),
};

function sortMarkets(list) {
  const comparator = SORT_COMPARATORS[sortOption];
  if (!comparator) return list; // 기본 정렬은 서버가 내려준 순서를 그대로 사용

  // 취소된 마켓은 항상 맨 아래로
  return [...list].sort((a, b) => {
    const aCancel = getStatusKey(a.isExpired) === 'cancel' ? 1 : 0;
    const bCancel = getStatusKey(b.isExpired) === 'cancel' ? 1 : 0;
    return aCancel - bCancel || comparator(a, b);
  });
}

// ---------- 부스 모집 현황 게이지 ----------

// 마켓의 총 부스 수 / 현재 신청된 부스 수 / 참여율(%)
// [수정] 초과 신청(allowOvercapacity)이 허용된 마켓은 신청 부스 수가 총 부스 수를
//   넘을 수 있는데, 예전에는 Math.min(100, ...)으로 100%에서 잘라버려 게이지가
//   더 이상 늘지 않는 것처럼 보였습니다. 이제 실제 비율(100% 초과)을 그대로 보여줍니다.
function getBoothRecruitStats(m) {
  const total = Number(m.maxparticipants ?? m.maxParticipants) || 0;
  const applied = Number(m.appliedBooths) || 0;
  const pct = total > 0 ? Math.round((applied / total) * 100) : 0;
  return { applied, total, pct };
}

function boothRecruitLevel(pct) {
  if (pct > 100) return 'over'; // 정원 초과
  if (pct >= 80) return 'high'; // 마감 임박
  if (pct >= 50) return 'mid'; // 보통
  return 'low'; // 여유
}

// 마켓 카드 하단에 붙는 모집 현황 게이지 (판매자 화면과 동일한 mb-gauge-* 스타일 재사용)
function renderBoothRecruitGauge(m) {
  const { applied, total, pct } = getBoothRecruitStats(m);
  if (total === 0) return '';
  const level = boothRecruitLevel(pct);
  // 진행바 채우기는 100%에서 시각적으로만 멈추고, 숫자(${pct}%)는 실제 값을 그대로 보여줍니다.
  const fillPct = Math.min(100, pct);
  return `
    <div class="mb-gauge" data-level="${level}">
      <div class="mb-gauge-head">
        <span class="mb-gauge-title">부스 모집 현황</span>
        <span class="mb-gauge-pct">${pct}%</span>
      </div>
      <div class="mb-gauge-track" role="progressbar"
           aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
           aria-label="부스 모집률 ${pct}%">
        <div class="mb-gauge-fill" style="width:${fillPct}%"></div>
      </div>
      <div class="mb-gauge-foot">
        <span class="mb-gauge-count"><strong>${applied}</strong> / ${total} 부스 모집</span>
      </div>
    </div>`;
}

// ---------- 렌더링 (목록 전체) ----------

// ---------- 승인 현황 게이지 (승인대기 / 승인됨 / 반려) ----------
// [추가] 결제 현황과 별개로, 판매자 신청건이 아직 주최자 승인을 기다리는지
//   / 승인을 받았는지 / 반려됐는지를 보여줍니다. "결제 현황"은 결제 단계
//   (승인 이후)만 다루므로, 그보다 앞선 승인 단계를 이 게이지가 보완합니다.
//   - 승인대기: status = 'Pending'
//   - 승인됨: 승인을 한 번이라도 통과한 건 전체
//            ('Approved'/'Paid'/'Refunded'/'RefundRequested'/'Expired')
//   - 반려: status = 'Rejected'
function getApprovalStats(m) {
  const pending = Number(m.pendingApprovalBooths) || 0;
  const approved = Number(m.approvedBooths) || 0;
  const rejected = Number(m.rejectedBooths) || 0;
  const total = pending + approved + rejected;
  return { pending, approved, rejected, total };
}

// 승인대기/승인됨/반려 3개 구간을 이어붙인 막대 + 하단 범례 (결제 현황과 동일한 스타일 재사용)
function renderApprovalStatusGauge(m) {
  const { pending, approved, rejected, total } = getApprovalStats(m);
  if (total === 0) return '';

  const approvedPct = Math.round((approved / total) * 100);
  const pendingPct = Math.round((pending / total) * 100);
  // 반올림 오차는 마지막 구간(반려)에서 흡수해 항상 합이 100%가 되게 함
  const rejectedPct = Math.max(0, 100 - approvedPct - pendingPct);

  return `
    <div class="payment-gauge approval-gauge">
      <div class="payment-gauge-head">
        <span class="payment-gauge-title">승인 현황</span>
        <span class="payment-gauge-total">총 <strong>${total}</strong>건 신청</span>
      </div>
      <div class="payment-gauge-track" role="img"
           aria-label="총 ${total}건 중 승인대기 ${pending}건, 승인됨 ${approved}건, 반려 ${rejected}건">
        ${approved > 0 ? `<div class="payment-gauge-seg is-approved" style="width:${approvedPct}%"></div>` : ''}
        ${pending > 0 ? `<div class="payment-gauge-seg is-pending" style="width:${pendingPct}%"></div>` : ''}
        ${rejected > 0 ? `<div class="payment-gauge-seg is-rejected" style="width:${rejectedPct}%"></div>` : ''}
      </div>
      <div class="payment-gauge-legend">
        <span class="payment-gauge-legend-item is-approved"><i></i>승인됨 <strong>${approved}</strong></span>
        <span class="payment-gauge-legend-item is-pending"><i></i>승인대기 <strong>${pending}</strong></span>
        <span class="payment-gauge-legend-item is-rejected"><i></i>반려 <strong>${rejected}</strong></span>
      </div>
    </div>`;
}

// ---------- 결제 현황 게이지 (결제완료 / 결제대기 / 환불완료) ----------
// [추가] 주최자는 "부스 신청 현황"(모집률)은 볼 수 있었지만, 판매자들의 결제
//   진행 상황(결제까지 마쳤는지 / 아직 결제 전인지 / 환불됐는지)은 확인할 수
//   없었습니다. applications.status를 기준으로 3가지로 나눠서 보여줍니다.
//   - 결제완료: status = 'Paid'
//   - 결제대기: status = 'Approved' (승인은 됐지만 아직 결제 전)
//   - 환불완료: status IN ('Refunded', 'RefundRequested') (환불 승인 완료 + 환불 진행중 건 포함)
function getPaymentStats(m) {
  const paid = Number(m.paidBooths) || 0;
  const pending = Number(m.pendingPaymentBooths) || 0;
  const refunded = Number(m.refundedBooths) || 0;
  const total = paid + pending + refunded;
  return { paid, pending, refunded, total };
}

// 결제완료/결제대기/환불완료 3개 구간을 이어붙인 막대 + 하단 범례
function renderPaymentStatusGauge(m) {
  const { paid, pending, refunded, total } = getPaymentStats(m);
  if (total === 0) return '';

  const paidPct = Math.round((paid / total) * 100);
  const pendingPct = Math.round((pending / total) * 100);
  // 반올림 오차는 마지막 구간(환불완료)에서 흡수해 항상 합이 100%가 되게 함
  const refundedPct = Math.max(0, 100 - paidPct - pendingPct);

  return `
    <div class="payment-gauge">
      <div class="payment-gauge-head">
        <span class="payment-gauge-title">결제 현황</span>
        <span class="payment-gauge-total">총 <strong>${total}</strong>건 신청</span>
      </div>
      <div class="payment-gauge-track" role="img"
           aria-label="총 ${total}건 중 결제완료 ${paid}건, 결제대기 ${pending}건, 환불완료 ${refunded}건">
        ${paid > 0 ? `<div class="payment-gauge-seg is-paid" style="width:${paidPct}%"></div>` : ''}
        ${pending > 0 ? `<div class="payment-gauge-seg is-pending" style="width:${pendingPct}%"></div>` : ''}
        ${refunded > 0 ? `<div class="payment-gauge-seg is-refunded" style="width:${refundedPct}%"></div>` : ''}
      </div>
      <div class="payment-gauge-legend">
        <span class="payment-gauge-legend-item is-paid"><i></i>결제완료 <strong>${paid}</strong></span>
        <span class="payment-gauge-legend-item is-pending"><i></i>결제대기 <strong>${pending}</strong></span>
        <span class="payment-gauge-legend-item is-refunded"><i></i>환불완료 <strong>${refunded}</strong></span>
      </div>
    </div>`;
}

function renderMarketList() {
  const listEl = document.getElementById('market-list');
  const emptyEl = document.getElementById('empty-state');
  const countEl = document.getElementById('result-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent =
      allMarkets.length === 0 ? '' : `${myMarkets.length}건`;
  }

  if (!myMarkets || myMarkets.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent =
        allMarkets.length === 0
          ? '등록한 마켓이 없어요. 마켓을 등록해보세요.'
          : searchKeyword
            ? `'${searchKeyword}'에 대한 검색 결과가 없어요.`
            : '해당 상태의 마켓이 없어요.';
    }
    renderPagination(0);
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  const totalPages = Math.max(1, Math.ceil(myMarkets.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = myMarkets.slice(start, start + PAGE_SIZE);

  listEl.innerHTML = pageItems
    .map((market) => renderMarketItem(market))
    .join('');
  renderPagination(totalPages);

  listEl.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener('click', () => handleToggleDetail(el.dataset.id));
  });
  listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.id));
  });
}

// 현재 페이지 기준으로 보여줄 페이지 번호 목록을 만듦 (main.js와 동일한 축약 규칙)
function getPageWindow(current, total) {
  const SIBLINGS = 2;
  const first = 1;
  const last = total;

  if (total <= SIBLINGS * 2 + 3) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const start = Math.max(current - SIBLINGS, first);
  const end = Math.min(current + SIBLINGS, last);
  const pages = [];

  pages.push(first);
  if (start > first + 1) pages.push('…');
  else if (start === first + 1) pages.push(first + 1);

  for (let p = start; p <= end; p++) {
    if (p !== first && p !== last) pages.push(p);
  }

  if (end < last - 1) pages.push('…');
  else if (end === last - 1) pages.push(last - 1);

  pages.push(last);

  return pages.filter((p, i) => p === '…' || pages.indexOf(p) === i);
}

function renderPagination(totalPages) {
  const nav = document.getElementById('pagination');
  if (!nav) return;
  if (totalPages <= 1) { nav.innerHTML = ''; return; }

  const buttons = [];
  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`
  );

  getPageWindow(currentPage, totalPages).forEach((p) => {
    if (p === '…') {
      buttons.push(`<span class="page-ellipsis">…</span>`);
    } else {
      buttons.push(
        `<button type="button" class="page-btn${p === currentPage ? ' is-active' : ''}" data-page="${p}">${p}</button>`
      );
    }
  });

  buttons.push(
    `<button type="button" class="page-btn page-nav" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`
  );
  nav.innerHTML = buttons.join('');
}

function handlePaginationClick() {
  const nav = document.getElementById('pagination');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.page-btn');
    if (!btn || btn.disabled) return;
    const page = Number(btn.dataset.page);
    if (!page || page === currentPage) return;
    currentPage = page;
    renderMarketList();
    document.getElementById('market-list-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------- 렌더링 (카드 한 장) ----------

function renderMarketItem(market) {
  const isOpen = market.isExpired;
  const statusKey = getStatusKey(isOpen);
  const id = market.marketId;
  const isExpanded = expandedId === String(id) || expandedId === id;

  // [수정] 기존에는 href="${marketUrl} ${marketUrl2}" 처럼 속성이 href 문자열 안에
  //        들어가 있어서 링크가 깨졌습니다. href 와 나머지 속성을 분리합니다.
  let marketUrl = '#';
  let marketAttrs = '';

  if (statusKey === 'open') {
    marketUrl = `correctionMarket?marketId=${id}`;
  } else {
    const reason =
      statusKey === 'closed'
        ? '마감된 마켓은 수정할 수 없어요.'
        : '취소된 마켓은 수정할 수 없어요.';
    marketAttrs = `aria-disabled="true" tabindex="-1" title="${reason}" onclick="return false;"`;
  }

  return `
<li class="my-market-item"
    data-market-id="${id}"
    style="${statusKey === 'cancel' ? 'pointer-events:none; opacity:0.5;' : ''}">

  <div class="my-market-item-top"
       data-action="toggle"
       data-id="${id}"
       style="cursor:pointer;">
    <span class="my-market-item-title">${escapeHtml(market.title)}</span>
    <span class="status-tag ${statusKey}">${STATUS_LABEL[statusKey]}</span>
  </div>

  <!-- [추가] 모집 / 개최 D-DAY 한 행 표기 -->
  ${renderDDayBadges(market, statusKey)}

  <div class="item-card-actions">
    <a class="btn btn-outline btn-sm" href="${marketUrl}" ${marketAttrs}>수정하기</a>
    <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${id}">취소하기</button>
    <a class="btn btn-sage btn-sm" href="market-detail?marketId=${id}">보러가기</a>
  </div>

  ${renderBoothRecruitGauge(market)}
  ${renderApprovalStatusGauge(market)}
  ${renderPaymentStatusGauge(market)}

  <!-- 📌 상세 영역은 별도 컨테이너로 분리, id로 특정해서 부분 업데이트 -->
  <div class="market-detail-slot" id="market-detail-${id}">${isExpanded ? renderMarketDetail(market) : ''}</div>
</li>
  `;
}

function renderMarketDetail(market) {
  const statusKey = getStatusKey(market.isExpired);
  const recruit = statusKey === 'cancel' ? null : getRecruitDDay(market);
  const event = statusKey === 'cancel' ? null : getEventDDay(market);
  const suffix = (d) =>
    d ? ` <span class="hm-dday-inline">(${escapeHtml(d.label)})</span>` : '';

  return `
    <div class="item-card-detail">
      <p class="item-card-meta">마켓 이름: ${escapeHtml(market.title) || '-'}</p>
      <p class="item-card-meta">개최 일자: ${formatDateRange(market.eventDate_min, market.eventDate_max)}${suffix(event)}</p>
      <p class="item-card-meta">모집 일자: ${formatDateRange(market.recruitmentDate_min, market.recruitmentDate_max)}${suffix(recruit)}</p>
      <p class="item-card-meta">장소: ${escapeHtml(market.locationName) || '-'}</p>
      <p class="item-card-meta">소개: ${escapeHtml(market.description) || '등록된 소개가 없어요.'}</p>
    </div>`;
}

// ---------- 이벤트 핸들러 ----------

// 📌 핵심 수정: renderMarketList() 전체 재실행 대신, 해당 슬롯만 innerHTML 교체
function handleToggleDetail(id) {
  const prevId = expandedId;
  const isCollapsing = String(prevId) === String(id);

  expandedId = isCollapsing ? null : id;

  // 이전에 열려있던 카드가 있고, 지금 누른 카드와 다르면 -> 닫아줌
  if (prevId !== null && String(prevId) !== String(id)) {
    updateDetailSlot(prevId, false);
  }

  // 지금 누른 카드는 열림/닫힘 토글
  updateDetailSlot(id, !isCollapsing);
}

function updateDetailSlot(id, shouldExpand) {
  const slot = document.getElementById(`market-detail-${id}`);
  if (!slot) return;

  if (!shouldExpand) {
    slot.innerHTML = '';
    return;
  }

  const market = myMarkets.find((m) => String(m.marketId) === String(id));
  if (!market) return;

  slot.innerHTML = renderMarketDetail(market);
}

async function handleDeleteClick(marketId) {
  hideAlert();
  if (!marketId) return;

  const confirmed = window.confirm(
    '정말 이 마켓을 취소하시겠습니까? 취소 후에는 되돌릴 수 없어요.',
  );
  if (!confirmed) return;

  try {
    const res = await deleteMarket(marketId);
    if (res && res.success) {
      renderAlert('마켓이 취소되었습니다.', 'success');
      if (String(expandedId) === String(marketId)) expandedId = null;
      await loadMyMarkets();
    } else {
      renderAlert(res?.message || '취소에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

// ---------- 필터 ----------

// 검색 키워드가 마켓 하나와 맞는지 확인 (제목/지역/장소를 훑음)
function matchesSearchKeyword(m) {
  if (!searchKeyword) return true;
  const haystack = [m.title, m.region, m.locationName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(searchKeyword);
}

// 상태 필터 -> 검색 키워드 -> 정렬 순으로 적용
function applyStatusFilter() {
  const byStatus = statusFilter
    ? allMarkets.filter((m) => getStatusKey(m.isExpired) === statusFilter)
    : allMarkets;
  const filtered = byStatus.filter(matchesSearchKeyword);
  myMarkets = sortMarkets(filtered);
  renderMarketList(); // 필터 변경 시에는 목록 자체가 바뀌니 전체 재렌더링이 맞음
}

function handleFilterChange() {
  statusFilter = document.getElementById('status-filter')?.value || '';
  expandedId = null;
  currentPage = 1;
  applyStatusFilter();
}

// [수정] search.js 의 실시간 검색창이 호출하는 훅.
// allMarkets(서버에서 받은 전체 목록) 기준으로 다시 필터링하므로,
// 지금 화면에 없는(다른 페이지의) 마켓도 검색됩니다.
window.setMyMarketSearchKeyword = function (keyword) {
  searchKeyword = (keyword || '').trim().toLowerCase();
  expandedId = null;
  currentPage = 1;
  applyStatusFilter();
};

// [추가 07-28] 정렬 변경 시에는 서버에 다시 요청해 DB 정렬 결과를 그대로 받아옴
async function handleSortChange() {
  sortOption = document.getElementById('sort-filter')?.value || '';
  expandedId = null;
  currentPage = 1;
  await loadMyMarkets();
}

// ---------- 초기 로드 ----------

async function loadMyMarkets() {
  const listEl = document.getElementById('market-list');
  if (!listEl) return;

  try {
    const res = await getMyMarkets(sortOption);
    if (res && res.success) {
      allMarkets = res.data || [];
      applyStatusFilter();
    } else {
      listEl.innerHTML =
        '<p class="list-empty">마켓 목록을 불러오지 못했어요.</p>';
    }
  } catch (err) {
    listEl.innerHTML = '<p class="list-empty">서버에 연결할 수 없어요.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isLoggedIn = !!sessionStorage.getItem('loggedInUser');
  if (!isLoggedIn) {
    window.location.href = '../A_auth-main/login.html';
    return;
  }
  document
    .getElementById('status-filter')
    ?.addEventListener('change', handleFilterChange);
  document
    .getElementById('sort-filter')
    ?.addEventListener('change', handleSortChange);
  handlePaginationClick();
  loadMyMarkets();
});
