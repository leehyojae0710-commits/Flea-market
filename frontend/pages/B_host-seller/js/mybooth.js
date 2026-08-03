// 담당 B: 판매자 화면 - 내 부스 관리
// 함수명은 docs/naming-convention.md 규칙(동사 시작 + camelCase)을 따릅니다.
// 대기중(Pending) 상태의 신청만 수정·취소할 수 있습니다(백엔드 규칙과 동일).

// ---------- API 호출 ----------

async function getMyBoothList() {
  return callApi('/applications/my');
}

async function deleteMyBoothApplication(applicationId) {
  return callApi(`/applications/${applicationId}`, { method: 'DELETE' });
}

// [추가] 행사 평가(별점) 등록
// 수정
async function submitBoothReview(applicationId, rating, comment) {
  return callApi('/reviews', {
    method: 'POST',
    body: { applicationId: Number(applicationId), rating, comment },
  });
}
async function requestRefund(applicationId, reason) {
  return callApi('/payments/request-refund', {
    method: 'POST',
    body: { applicationId, reason },
  });
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

const STATUS_LABEL = {
  Pending: '대기중',
  Approved: '승인됨',
  Rejected: '반려됨',
  Paid: '결제됨',
  Refunded: '결제 취소',
  RefundRequested: '환불 요청'
};
const STATUS_CLASS = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
  Paid: 'paid',
  Refunded: 'refunded',
  RefundRequested: 'RefundRequested'
};

// ---------- 상태 ----------

let allApplications = [];
let myApplications = [];
let statusFilter = '';
let expandedId = null; // 상세정보가 펼쳐진 신청 id
let reviewOpenId = null; // 별점 입력창이 펼쳐진 신청 id (문자열로 비교)
let reviewDraftRating = 0; // 별점 입력창에서 아직 제출 전인 값 (0~5)
// [수정] 검색 키워드. search.js 가 window.setMyBoothSearchKeyword() 로 넘겨줍니다.
// (페이지네이션으로 한 페이지에 5건만 DOM에 있다 보니, 다른 페이지의 신청 내역은
//  기존 방식(화면에 그려진 카드만 텍스트 검색)으로는 못 찾았습니다.)
let searchKeyword = '';
// [중복 부스 신청] 「중복 신청만 보기」 체크 여부. 서버가 내려준 marketDuplicateCount 로 판단합니다.
let duplicateOnly = false;
// [중복 부스] 특정 마켓의 중복 건만 볼 때 그 마켓 id. null 이면 마켓 제한 없음.
//   ①「중복 N」 배지를 누르거나 ② 중복 마켓 목록에서 한 곳을 고르면 설정됩니다.
let duplicateMarketId = null;

// ---------- 페이지네이션 ----------
const PAGE_SIZE = 20;
let currentPage = 1;

// ---------- 렌더링 ----------

function renderBoothList() {
  const wrap = document.getElementById('booth-list');
  const emptyState = document.getElementById('empty-state');
  const countEl = document.getElementById('result-count');
  if (!wrap) return;

  if (countEl) {
    countEl.textContent =
      allApplications.length === 0 ? '' : `${myApplications.length}건`;
  }

  // [중복 부스 신청] 요약 줄은 필터와 무관하게 전체 목록 기준으로 갱신합니다.
  renderMyDuplicateSummary();

  if (!myApplications || myApplications.length === 0) {
    wrap.innerHTML = '';
    if (emptyState) {
      emptyState.hidden = false;
      // [중복 부스] 마켓·상태 조건이 겹쳐 결과가 0건일 때, 무엇 때문에 비었는지 알려줍니다.
      //   그냥 "신청이 없어요" 라고만 하면 필터가 걸린 줄 모르고 사라진 줄 압니다.
      emptyState.textContent =
        allApplications.length === 0
          ? '아직 신청한 부스가 없어요.'
          : searchKeyword
            ? `'${searchKeyword}'에 대한 검색 결과가 없어요.`
            : duplicateMarketId
              ? '고른 마켓에 해당 상태의 중복 신청이 없어요. 위 「전체 보기」를 누르거나 상태를 바꿔보세요.'
              : duplicateOnly
                ? '해당 상태의 중복 신청이 없어요.'
                : '해당 상태의 신청이 없어요.';
    }
    renderPagination(0);
    return;
  }
  if (emptyState) emptyState.hidden = true;

  const totalPages = Math.max(1, Math.ceil(myApplications.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = myApplications.slice(start, start + PAGE_SIZE);

  wrap.innerHTML = pageItems.map((a) => renderBoothCard(a)).join('');
  renderPagination(totalPages);

  wrap.querySelectorAll('[data-action="toggle"]').forEach((el) => {
    el.addEventListener('click', () => handleToggleDetail(el.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteClick(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="review-toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReviewToggle(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="star-pick"]').forEach((btn) => {
    btn.addEventListener('click', () =>
      handleStarPick(Number(btn.dataset.value)),
    );
  });
  wrap.querySelectorAll('[data-action="review-reset"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReviewReset());
  });
  wrap.querySelectorAll('[data-action="review-submit"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReviewSubmit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="review-cancel"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReviewCancel());
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
    renderBoothList();
    document.getElementById('booth-list-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------- 부스 모집 현황 게이지 (내가 신청한 마켓 기준) ----------
// [추가] 내가 신청한 마켓의 총 부스 수 / 현재 신청된 부스 수 / 참여율(%).
//   내 마켓 관리(marketdelete.js)의 게이지와 동일한 계산식이며, 초과 신청
//   (allowOvercapacity)이 허용된 마켓은 100%를 넘는 실제 비율을 그대로 보여줍니다.
function getBoothRecruitStats(a) {
  const total = Number(a.maxparticipants ?? a.maxParticipants) || 0;
  const applied = Number(a.appliedBooths) || 0;
  const pct = total > 0 ? Math.round((applied / total) * 100) : 0;
  return { applied, total, pct };
}

function boothRecruitLevel(pct) {
  if (pct > 100) return 'over'; // 정원 초과
  if (pct >= 80) return 'high'; // 마감 임박
  if (pct >= 50) return 'mid'; // 보통
  return 'low'; // 여유
}

// 판매자 화면과 동일한 mb-gauge-* 스타일 재사용
function renderBoothRecruitGauge(a) {
  const { applied, total, pct } = getBoothRecruitStats(a);
  if (total === 0) return '';
  const level = boothRecruitLevel(pct);
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

/* ---------------- [추가] 같은 마켓 중복 신청 표시 ----------------
 *
 * 한 마켓에 부스를 여러 칸 신청하는 것은 허용 정책이라 막지 않습니다.
 * 다만 판매자 본인이 "내가 이 마켓에 몇 칸 신청했는지"를 한눈에 봐야 실수를 잡을 수 있어서
 * 카드에 「중복 N」 배지를, 목록 위에 요약 줄을 답니다.
 * 세는 기준은 서버(utills/duplicateApplication.js)와 같고 반려·환불완료 건은 빠집니다.
 */

// [중복 부스] 배지를 누르면 그 마켓의 중복 신청만 걸러 봅니다.
//   카드 제목 영역은 상세 펼치기(toggle)라, 배지 클릭이 그쪽으로 새지 않도록
//   아래 위임 핸들러에서 stopPropagation 합니다.
function renderMyDuplicateBadge(a) {
  const count = Number(a.marketDuplicateCount) || 0;
  if (count < 2) return '';
  const booths = Array.isArray(a.marketDuplicateBooths) ? a.marketDuplicateBooths : [];
  const boothText = booths.length > 0 ? ` (${booths.slice(0, 5).join(', ')}번${booths.length > 5 ? ' 외' : ''})` : '';
  const selected = String(duplicateMarketId) === String(a.marketId);
  return `<button type="button" class="dup-badge dup-badge-btn${selected ? ' active' : ''}"
            data-action="dup-market" data-market-id="${a.marketId}"
            title="${selected ? '누르면 전체 목록으로 돌아가요.' : `이 마켓에 신청한 ${count}칸만 모아 봐요.`}${boothText}">중복 ${count}</button>`;
}

function renderMyDuplicateSummary() {
  const box = document.getElementById('booth-duplicate-summary');
  if (!box) return;

  // 마켓별로 묶습니다. (같은 마켓의 여러 신청이 같은 marketDuplicateCount 를 들고 옵니다)
  const map = new Map();
  allApplications.forEach((a) => {
    const count = Number(a.marketDuplicateCount) || 0;
    if (count >= 2) {
      map.set(String(a.marketId), {
        marketId: a.marketId,
        count,
        title: a.marketTitle || `마켓 ${a.marketId}`,
        booths: Array.isArray(a.marketDuplicateBooths) ? a.marketDuplicateBooths : [],
      });
    }
  });

  if (map.size === 0) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }

  const escape = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let booths = 0;
  map.forEach((v) => { booths += v.count; });

  // [수정] 예전에는 마켓 이름을 글자로만 나열해서, 어느 마켓의 중복인지 보려면
  //   눈으로 찾아 스크롤해야 했습니다. 이제 목록으로 그리고 누르면 그 마켓만 걸러 봅니다.
  //   목록은 「중복 신청만 보기」를 켰을 때만 펼칩니다. (평소엔 요약 한 줄)
  const items = [...map.values()]
    .sort((a, b) => b.count - a.count)
    .map((v) => {
      const selected = String(duplicateMarketId) === String(v.marketId);
      const boothText = v.booths.length > 0
        ? `${v.booths.slice(0, 6).join(', ')}번${v.booths.length > 6 ? ' 외' : ''}`
        : '';
      return `
        <li>
          <button type="button" class="dup-market-item${selected ? ' active' : ''}"
                  data-action="dup-market" data-market-id="${v.marketId}">
            <span class="dmi-title">${escape(v.title)}</span>
            <span class="dmi-count">${v.count}칸</span>
            ${boothText ? `<span class="dmi-booths">${escape(boothText)}</span>` : ''}
          </button>
        </li>`;
    }).join('');

  const listBlock = duplicateOnly
    ? `<ul class="dup-market-list">${items}</ul>
       <span class="dup-summary-hint">마켓을 누르면 그 마켓에 신청한 부스만 모아서 볼 수 있어요.</span>`
    : `<span class="dup-summary-names">${[...map.values()].slice(0, 5)
        .map((v) => escape(`${v.title} ${v.count}칸`)).join(' / ')}${map.size > 5 ? ` 외 ${map.size - 5}곳` : ''}</span>
       <span class="dup-summary-hint">위 「중복 신청만 보기」를 켜면 마켓별로 골라 볼 수 있어요.</span>`;

  // 마켓을 하나 고른 상태면 무엇을 보고 있는지와 해제 버튼을 위에 답니다.
  const picked = duplicateMarketId ? map.get(String(duplicateMarketId)) : null;
  const pickedBar = picked
    ? `<div class="dup-picked">
         <span><strong>${escape(picked.title)}</strong>의 중복 신청 ${picked.count}칸만 보고 있어요.</span>
         <button type="button" class="btn btn-outline btn-sm" data-action="dup-clear">전체 보기</button>
       </div>`
    : '';

  box.innerHTML = `
    ${pickedBar}
    <strong>중복 신청한 마켓 ${map.size}곳 · 총 ${booths}칸</strong>
    ${listBlock}`;
  box.hidden = false;
}

/* [중복 부스] 배지·마켓 목록 클릭 처리 (한 곳에서 위임)
 *   목록은 다시 그려지므로 개별 버튼에 붙이지 않고 상위에서 받습니다. */
function handleDuplicateMarketClick() {
  document.addEventListener('click', (e) => {
    const clear = e.target.closest('[data-action="dup-clear"]');
    if (clear) {
      e.preventDefault();
      duplicateMarketId = null;
      expandedId = null;
      currentPage = 1;
      applyStatusFilter();
      return;
    }

    const btn = e.target.closest('[data-action="dup-market"]');
    if (!btn) return;

    // 카드 제목을 누르면 상세가 펼쳐지므로, 배지 클릭이 그쪽으로 새지 않게 막습니다.
    e.preventDefault();
    e.stopPropagation();

    const id = btn.dataset.marketId;
    // 이미 고른 마켓을 다시 누르면 해제 (토글)
    duplicateMarketId = String(duplicateMarketId) === String(id) ? null : id;

    // 마켓을 고르면 「중복 신청만 보기」도 함께 켭니다.
    //   안 켜면 그 마켓의 중복 아닌 건까지 섞여 나와 무엇을 보고 있는지 헷갈립니다.
    if (duplicateMarketId) {
      duplicateOnly = true;
      const box = document.getElementById('booth-duplicate-only');
      if (box) box.checked = true;
    }

    expandedId = null;
    currentPage = 1;
    applyStatusFilter();

    // 목록 위쪽으로 올려 결과가 바로 보이게 합니다.
    document.getElementById('booth-duplicate-summary')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function renderBoothCard(a) {
  const id = a.applicationId;
  const status = a.status || 'Pending';
  const refundAmount = a.refundAmount;
  const isPending = status === 'Pending';
  const isApproved = status === 'Approved' || status === 'Paid';
  const isExpanded = expandedId === String(id) || expandedId === id;
  return `
    <div class="item-card" data-application-id="${id}">
      <div class="item-card-top">
        <div data-action="toggle" data-id="${id}" style="cursor:pointer;">
          <div class="item-card-title">${a.marketTitle || '마켓 정보 없음'} · ${a.boothNumber}번 부스${a.title ? ` · ${a.title}` : ''} ${renderMyDuplicateBadge(a)}</div>
          <div class="item-card-meta">${a.itemName || '이름 미입력'}</div>
          <!-- [추가] 이 부스를 신청한 마켓의 주최자 -->
          <div class="item-card-meta">주최자: ${ProfileLink.html(a.hostId, a.hostNickname)}</div>
        </div>
        <span class="status-tag ${STATUS_CLASS[status] || 'pending'}">${STATUS_LABEL[status] || status}</span>
      </div>

      ${renderBoothRecruitGauge(a)}

    <div class="item-card-actions">
      <div class="action-group">
        <a class="btn btn-outline btn-sm" href="${isPending ? `booth-edit?applicationId=${id}` : '#'}" ${isPending ? '' : 'aria-disabled="true" tabindex="-1" title="대기중인 신청만 수정할 수 있어요." onclick="return false;"'}>수정</a>
        <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${id}" ${isPending ? '' : 'disabled title="대기중인 신청만 취소할 수 있어요."'}>삭제</button>
        ${status === 'Approved'
      ? renderPaymentArea(a)
      : ''
    }
    ${(status === 'Approved' || status === 'Paid') ? renderReviewTrigger(a) : ''}
    </div>
    ${status === 'Paid'
      ? `
    <span class="payment-area">
      <button type="button" class="btn btn-sage btn-sm" data-action="refunded"
      onclick="requestRefund_btn(${id}, '${status}',${refundAmount})" id = "refunded_btn">환불 요청</button>
    </span>
<div id="inputContainer" class="refund-policy-box" style="display: none;">
  <div class="refund-policy-title">환불 규정</div>

  <div class="refund-policy-table">
    <div class="refund-policy-row refund-policy-header">
      <span>내용</span>
      <span>환불 범위</span>
    </div>
    <div class="refund-policy-row">
      <span>개최 7일 전까지 결제 취소</span>
      <span class="refund-rate full">
      <span>
      예상 환불 금액 ${a.boothPrice} |
      </span>
      100%
      </span>
    </div>
    <div class="refund-policy-row">
      <span>개최 5일 전까지 결제 취소</span>
      <span class="refund-rate half">
      <span>
      예상 환불 금액 ${a.boothPrice * 0.5} |
      </span>
      50%
      </span>
    </div>
    <div class="refund-policy-row">
      <span>개최 3일 전까지 결제 취소</span>
      <span class="refund-rate none">
      <span>
      환불 불가 |
      </span>
      0%
      </span>
    </div>
  </div>

  <div class="refund-confirm-row">
    <label class="refund-checkbox-label">
      <span>동의하십니까?</span>
      <input type="checkbox" id="myCheckbox" />
    </label>
    <input type="text" id="userInput" class="form-input refund-input" placeholder="취소 내용을 입력하세요" />
    <button type="button" class="btn btn-sage btn-sm" data-action="refunded"
      onclick="requestRefund_(${id}, '${status}')">
      입력 확인
    </button>
  </div>
</div>
      `
      :
      ''
    }
    </div>

      ${(status === 'Approved' || status === 'Paid') && reviewOpenId === String(id) ? renderReviewForm(id) : ''}
      ${isExpanded ? renderBoothDetail(a) : ''}
    </div>`;
}

// 결제 기한 문자열을 안전하게 Date로 파싱 (없거나 형식이 이상하면 null)
function parsePaymentDue(paymentDueAt) {
  if (!paymentDueAt) return null;
  const due = new Date(String(paymentDueAt).replace(' ', 'T'));
  return isNaN(due.getTime()) ? null : due;
}

// 결제 마감이 지났는지(또는 기한 정보가 없는지) 여부
function isPaymentTimedOut(a) {
  const due = parsePaymentDue(a.paymentDueAt);
  if (!due) return true; // 기한 정보가 없으면(결제 완료 후 NULL 포함) 타임아웃으로 취급
  return due.getTime() - Date.now() <= 0;
}

// 승인된 신청의 결제 영역: 결제 완료 / 타임아웃 / 결제하기+타이머 셋 중 하나만 렌더링
function renderPaymentArea(a) {
  const id = a.applicationId;

  if (a.isPaid) {
    return `
      <span class="payment-area">
        <span class="Refunded btn-sm">결제 완료</span>
      </span>`;
  }

  if (isPaymentTimedOut(a)) {
    return `
      <span class="payment-area">
        <span class="status-tag rejected">타임아웃</span>
      </span>`;
  }

  // [부스 종류] a.boothPrice 는 서버가 "고른 종류의 가격(없으면 마켓 기본가)"으로 내려줍니다.
  //   화면에 보이는 금액과 결제창 금액이 항상 같아집니다.
  const typeTag = a.boothTypeName
    ? `<span class="booth-type-chip">${a.boothTypeName}</span>`
    : '';
  // [승인 시 금액 고정] approvedPrice 가 있으면 승인 시점에 확정된 금액입니다.
  //   주최자가 이후 가격을 바꿔도 이 금액은 안 바뀝니다.
  const lockTag = a.approvedPrice !== null && a.approvedPrice !== undefined
    ? `<span class="price-locked-chip" title="승인 시점에 확정된 금액이에요">확정</span>`
    : '';

  return `
    <span class="payment-area">
      ${typeTag}${lockTag}
      <a class="btn btn-danger btn-sm" href="payment?applicationId=${id}&amount=${a.boothPrice}&orderName=${a.marketTitle + '부스료'}">
      ${Number(a.boothPrice || 0).toLocaleString()}원 결제하기
      </a>
      <span class="payment-timer" data-due="${a.paymentDueAt}"></span>
    </span>`;
}

function updateTimers() {
  document.querySelectorAll('.payment-timer').forEach((timer) => {
    const due = parsePaymentDue(timer.dataset.due);

    // due가 없거나(NULL) 파싱 불가능한 값이면 NaN:NaN 대신 타임아웃으로 표시
    if (!due) {
      timer.textContent = '타임아웃';
      return;
    }

    const diff = due.getTime() - Date.now();

    if (diff <= 0) {
      timer.textContent = '타임아웃';
      return;
    }

    const totalMinutes = Math.floor(diff / 1000 / 60);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    timer.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });
}

// ---------- 행사 평가(별점) ----------

// 백엔드가 (m.eventDate_max < CURDATE())로 내려주는 값(1/0 또는 true/false)을 그대로 boolean으로 취급
function isEventEnded(a) {
  return !!a.eventEnded;
}

function renderStaticStars(rating) {
  const full = '★'.repeat(rating);
  const empty = '☆'.repeat(5 - rating);
  return `<span class="stars-static" aria-label="${rating}점">${full}${empty}</span>`;
}
// 수정·삭제와 같은 줄, 오른쪽에 배치되는 부분 (평가하기 버튼 또는 이미 남긴 별점 표시)
function renderReviewTrigger(a) {
  const id = a.applicationId;
  const hasReview = a.myRating !== null && a.myRating !== undefined;
  const eventEnded = isEventEnded(a);
  const isPaid = !!a.isPaid;

  if (hasReview) {
    return `
      <span class="review-summary">
        <span class="review-label">내 평가</span>
        ${renderStaticStars(a.myRating)}
        <span class="review-score">${a.myRating}점</span>
      </span>`;
  }

  const canReview = isPaid && eventEnded;
  let disabledTitle = '';
  if (!isPaid) disabledTitle = '결제가 완료되어야 평가할 수 있어요.';
  else if (!eventEnded) disabledTitle = '행사가 시작된 뒤에 평가할 수 있어요.';

  return `
    <button type="button" class="btn btn-outline btn-sm" data-action="review-toggle" data-id="${id}"
      ${canReview ? '' : `disabled title="${disabledTitle}"`}>
      행사 평가하기
    </button>`;
}

function renderReviewForm(id) {
  return `
    <div class="review-form">
      <div class="star-picker">
        ${[1, 2, 3, 4, 5]
      .map(
        (n) => `
          <button type="button" class="star-btn ${n <= reviewDraftRating ? 'filled' : ''}" data-action="star-pick" data-value="${n}" aria-label="${n}점">★</button>
        `,
      )
      .join('')}
      </div>
      <div class="review-form-meta">
        <span>${reviewDraftRating}점</span>
        <button type="button" class="link-reset" data-action="review-reset">초기화(0점)</button>
      </div>
      <textarea id="review-comment-input" class="review-comment-input" maxlength="200"
        placeholder="한줄평을 남겨주세요 (선택)"></textarea>
      <div class="review-form-actions">
        <button type="button" class="btn btn-primary btn-sm" data-action="review-submit" data-id="${id}">평가 등록</button>
        <button type="button" class="btn btn-outline btn-sm" data-action="review-cancel">취소</button>
      </div>
    </div>`;
}

function renderBoothDetail(a) {
  const eventDateLabel = a.eventDate_min
    ? `${new Date(a.eventDate_min).toLocaleDateString()} ~ ${a.eventDate_max ? new Date(a.eventDate_max).toLocaleDateString() : ''}`
    : '-';
  const imageSrc = a.itemImage
    ? a.itemImage.startsWith('http')
      ? a.itemImage
      : `${API_BASE_URL}${a.itemImage}`
    : null;
  return `
    <div class="item-card-detail">
      ${imageSrc ? `<img src="${imageSrc}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:10px;" />` : ''}
      <p class="item-card-meta">부스 이름: ${a.title || '등록된 이름이 없어요.'}</p>
      <p class="item-card-meta">행사 일자: ${eventDateLabel}</p>
      <p class="item-card-meta">장소: ${a.locationName || '-'}</p>
      <p class="item-card-meta">소개: ${a.productDesc || '등록된 소개가 없어요.'}</p>
    </div>`;
}

// ---------- 이벤트 핸들러 ----------

function handleToggleDetail(id) {
  expandedId = expandedId === id ? null : id;
  renderBoothList();
}

async function handleDeleteClick(id) {
  hideAlert();
  const confirmed = window.confirm(
    '이 부스 신청을 취소할까요? 취소 후에는 되돌릴 수 없어요.',
  );
  if (!confirmed) return;

  try {
    const res = await deleteMyBoothApplication(id);
    if (res && res.success) {
      renderAlert('부스 신청을 취소했어요.', 'success');
      if (expandedId === id) expandedId = null;
      await loadMyBoothList();
    } else {
      renderAlert(res?.message || '취소에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}

function handleReviewToggle(id) {
  reviewOpenId = reviewOpenId === String(id) ? null : String(id);
  reviewDraftRating = 0; // 열 때마다 빈 별에서 다시 시작
  renderBoothList();
}

function handleStarPick(value) {
  reviewDraftRating = value;
  renderBoothList();
}

function handleReviewReset() {
  reviewDraftRating = 0;
  renderBoothList();
}

function handleReviewCancel() {
  reviewOpenId = null;
  reviewDraftRating = 0;
  renderBoothList();
}

async function handleReviewSubmit(id) {
  hideAlert();

  const confirmed = window.confirm('평가를 등록하면 변경할 수 없습니다. 등록하시겠어요?');
  if (!confirmed) return;

  const commentValue = document.getElementById('review-comment-input')?.value.trim() || undefined;

  try {
    const res = await submitBoothReview(id, reviewDraftRating, commentValue);
    if (res && res.success) {
      renderAlert('행사 평가를 등록했어요.', 'success');
      reviewOpenId = null;
      reviewDraftRating = 0;
      await loadMyBoothList();
    } else {
      renderAlert(res?.message || '평가 등록에 실패했어요.');
    }
  } catch (err) {
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  }
}
function requestRefund_btn(a_id, a_status, p_refundAmount) {
  const inputContainer = document.getElementById('inputContainer');
  const btnText = document.getElementById('refunded_btn');
  if (inputContainer.style.display === 'none') {
    btnText.textContent  = '환불 요청 취소';
    inputContainer.style.display = 'block'
  }
  else {
    btnText.textContent  = '환불 요청';
    inputContainer.style.display = 'none'
  }
}
// 결제 환불 요청
async function requestRefund_(a_id, a_status) {
  const checkbox = document.getElementById('myCheckbox');
  const inputContainer = document.getElementById('inputContainer');
  if (!checkbox.checked) {
    alert('약관에 동의하셔야 요청을 보낼 수 있습니다.');
    return;
  }
  if (a_status != 'Paid')
    return;
  try {
    const data = await requestRefund(a_id, '환불 요청')
    if (data && data.success) {
      renderAlert('환불 요청이 접수 되었습니다.', 'success')
      await loadMyBoothList();
    }
    else {
      renderAlert(data.message);
    }
  }
  catch (err) {
    renderAlert("서버에 연결할 수 없어요 잠시 후 다시 시도해주세요.");
  }
  inputContainer.style.display = 'none'
  renderBoothList();
}

// ---------- 필터 ----------

// 검색 키워드가 신청 내역 하나와 맞는지 확인 (마켓명/부스번호/상품명/주최자명을 훑음)
function matchesSearchKeyword(a) {
  if (!searchKeyword) return true;
  const haystack = [a.marketTitle, a.title, a.itemName, a.hostNickname, a.boothNumber]
    .filter((v) => v !== undefined && v !== null)
    .join(' ')
    .toLowerCase();
  return haystack.includes(searchKeyword);
}

// [추가] '환불' 필터는 신청 status 값 하나와 1:1로 매핑되지 않아
//        (환불 요청중 + 환불 완료 두 상태를 함께 묶어야 해서) 별도 매핑 테이블로 처리합니다.
//        - 환불(Refund): status IN ('Refunded', 'RefundRequested')
//        (결제대기는 승인됨(status === 'Approved')과 동일한 상태라 별도 옵션을 두지 않습니다.)
const STATUS_FILTER_MAP = {
  Refund: ['Refunded', 'RefundRequested'],
};

function applyStatusFilter() {
  const groupedStatuses = STATUS_FILTER_MAP[statusFilter];
  const byStatus = statusFilter
    ? allApplications.filter((a) => {
        const status = a.status || 'Pending';
        return groupedStatuses
          ? groupedStatuses.includes(status)
          : status === statusFilter;
      })
    : allApplications;
  const byDuplicate = duplicateOnly
    ? byStatus.filter((a) => Number(a.marketDuplicateCount) >= 2)
    : byStatus;

  // [중복 부스] 특정 마켓을 고른 상태면 그 마켓의 중복 건만 남깁니다.
  //   마켓을 고른 것 자체가 "중복만 보겠다"는 뜻이므로 중복 조건도 함께 겁니다.
  const byMarket = duplicateMarketId
    ? byDuplicate.filter((a) => String(a.marketId) === String(duplicateMarketId)
        && Number(a.marketDuplicateCount) >= 2)
    : byDuplicate;

  myApplications = byMarket.filter(matchesSearchKeyword);
  renderBoothList();
}

function handleDuplicateOnlyToggle() {
  const box = document.getElementById('booth-duplicate-only');
  if (!box) return;
  box.addEventListener('change', () => {
    duplicateOnly = box.checked;
    // 체크를 끄면 마켓 선택도 함께 풀립니다. (켜면 마켓 목록부터 다시 고르게)
    duplicateMarketId = null;
    expandedId = null;
    currentPage = 1;
    applyStatusFilter();
  });
}

function handleFilterChange() {
  statusFilter = document.getElementById('status-filter')?.value || '';
  expandedId = null;
  reviewOpenId = null;
  reviewDraftRating = 0;
  currentPage = 1;
  applyStatusFilter();
}

// [수정] search.js 의 실시간 검색창이 호출하는 훅.
// allApplications(서버에서 받은 전체 목록) 기준으로 다시 필터링하므로,
// 지금 화면에 없는(다른 페이지의) 신청 내역도 검색됩니다.
window.setMyBoothSearchKeyword = function (keyword) {
  searchKeyword = (keyword || '').trim().toLowerCase();
  expandedId = null;
  reviewOpenId = null;
  reviewDraftRating = 0;
  currentPage = 1;
  applyStatusFilter();
};

// ---------- 초기 로드 ----------

async function loadMyBoothList() {
  const wrap = document.getElementById('booth-list');
  if (!wrap) return;

  try {
    const res = await getMyBoothList();
    if (res && res.success) {
      allApplications = res.data || [];
      applyStatusFilter();
    } else {
      wrap.innerHTML =
        '<p class="list-empty">부스 목록을 불러오지 못했어요.</p>';
    }
  } catch (err) {
    wrap.innerHTML = '<p class="list-empty">서버에 연결할 수 없어요.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isLoggedIn = !!sessionStorage.getItem('loggedInUser');
  setInterval(updateTimers, 1000);
  if (!isLoggedIn) {
    window.location.href = '../A_auth-main/login.html';
    return;
  }
  document
    .getElementById('status-filter')
    ?.addEventListener('change', handleFilterChange);
  handlePaginationClick();
  handleDuplicateOnlyToggle();
  // [중복 부스] 배지 / 마켓 목록 클릭으로 그 마켓의 중복 건만 보기
  handleDuplicateMarketClick();
  loadMyBoothList();
});
