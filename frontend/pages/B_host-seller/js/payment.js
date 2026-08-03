// 담당 B/D: 포트원 실결제 프론트 로직

// 📌 포트원 콘솔에서 발급받은 값으로 교체하세요
const PORTONE_STORE_ID = "store-6187aa03-b350-43a3-96c7-31c846d1aa1c";
const PORTONE_CHANNEL_KEY = "channel-key-15892876-53e7-45a8-8a44-923ec53d5ae1";

// ============================================
// 백엔드 API 호출 함수들
// ============================================

// 결제 완료 후, 서버에 검증 요청 (applicationId + paymentId 둘 다 전달해야 함)
async function confirmPayment(applicationId, paymentId) {
  return callApi('/payments/confirm', {
    method: 'POST',
    body: { applicationId, paymentId },
  });
}

// 결제 내역
let paymentGroups = [];
let expandedMarketIds  = new Set();

async function historys() {
  return callApi('/payments/history', {
    method: 'POST',
  })
}
async function changePage() {
  const page = document.getElementById('profile-panel');
  const ui = document.getElementById('payment-list');
  if (!page)
    return;
  if (!ui)
    return;
  if (page.hidden) {
    page.hidden = false;
    ui.hidden = true;
  }
  else {
    page.hidden = true;
    ui.hidden = false;
    payment_history();
  }
}
async function payment_history() {
  const ui = document.getElementById('payment-list');
  if (!ui) return;
  try {
    const data = await historys();
    if (data && data.success) {
      paymentGroups = groupByMarket(data.data);
      renderPaymentGroups();
    } else {
      document.getElementById('payment-list').innerHTML = '<p class="list-empty">내역을 불러오지 못했습니다.</p>';
    }
  } catch (error) {
    console.error('payment_history 오류:', error);
    renderAlert("오류");
  }
}
function groupByMarket(items) {
  const groups = new Map();

  items.forEach((item) => {
    const key = item.marketId;
    if (!groups.has(key)) {
      groups.set(key, {
        marketId: item.marketId,
        marketTitle: item.marketTitle,
        status: item.status,
        totalAmount: 0,
        items: [],
      });
    }
    const group = groups.get(key);
    if (item.status === 'Paid')
      group.totalAmount += Number(item.amount) || 0;
    else if (item.status === 'Refunded')
      group.totalAmount += Number(item.amount - item.refundAmount) || 0;
    group.items.push(item);
  });
  return Array.from(groups.values());
}

function renderPaymentGroups() {
  const ui = document.getElementById('payment-list');
  if (!ui) return;
  if (paymentGroups.length === 0) {
    ui.innerHTML = '<p class="list-empty">결제/환불 내역이 없습니다.</p>';
    return;
  }

  ui.innerHTML = paymentGroups.map((group) => {
    const isExpanded = expandedMarketIds.has(String(group.marketId));
    return `
    <div class="item-card">
      <div class="item-card-top">
        <span class="item-card-title">${group.marketTitle}</span>
        <span class="item-card-meta">총 ${group.totalAmount.toLocaleString()}원</span>
      </div>
      <button type="button" class="btn btn-outline btn-sm" data-action="toggle-detail" data-market-id="${group.marketId}">
        ${isExpanded ? '접기' : '자세히 보기'}
      </button>
      <div id="detail-${group.marketId}" class="detail-wrap ${isExpanded ? 'open' : ''}">
        ${isExpanded ? renderGroupDetail(group) : ''}
      </div>
    </div>
  `;
  }).join('');
  ui.querySelectorAll('[data-action="toggle-detail"]').forEach((btn) => {
    btn.addEventListener('click', () => handleToggleDetail(btn.dataset.marketId));
  });
}
function renderGroupDetail(group) {
  return `
    <div class="item-card-detail">
      <table class="detail-table">
        <thead>
          <tr>
            <th>판매자</th>
            <th>원금</th>
            <th>환불 금액</th>
            <th>결제 금액</th>
          </tr>
        </thead>
        <tbody>
          ${group.items.map((item) => `
            <tr>
              <td>${item.sellerNickname}</td>
              <td>${Number(item.amount).toLocaleString()}원</td>
              <td>${Number(item.refundAmount).toLocaleString()}원</td>
              <td>${Number(item.amount - item.refundAmount).toLocaleString()}원</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}
function handleToggleDetail(marketId) {
  const key = String(marketId);
  if (expandedMarketIds.has(key)) {
    expandedMarketIds.delete(key);
  } else {
    expandedMarketIds.add(key);
  }
  renderPaymentGroups();
}

// ============================================
// 알림 관련 유틸
// ============================================
function renderAlert(message, type = 'error') {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('alert-error', 'alert-success');
  box.classList.add(type === 'success' ? 'alert-success' : 'alert-error', 'show');
}

function hideAlert() {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.classList.remove('show');
}

// ============================================
// URL 파라미터에서 결제 정보 읽어와 화면에 표시
// (예: payment.html?applicationId=12&amount=20000&orderName=홍대야간플리마켓+부스료)
// ============================================
function getPaymentParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    applicationId: params.get('applicationId'),
    amount: Number(params.get('amount')) || 0,
    orderName: params.get('orderName') || '플리마켓 부스료',
  };
}

function prefillPaymentAmount(amount) {
  const amountEl = document.getElementById('amount');
  if (amountEl) amountEl.textContent = amount.toLocaleString();

  // 부스료 0원(무료 부스)이면 안내 문구/버튼 라벨을 결제가 아닌 등록 확정 흐름으로 표시
  if (amount === 0) {
    const hintEl = document.querySelector('.form-hint');
    if (hintEl) hintEl.textContent = '무료 부스입니다. 등록하기를 누르면 신청이 확정돼요.';

    const btn = document.getElementById('pay-btn');
    if (btn) btn.textContent = '등록하기';
  }
}

// 부스료 0원(무료 부스): 포트원 결제창 없이 바로 서버에 등록 확정 요청
async function handleFreeBoothConfirm(applicationId, btn, originalText) {
  btn.textContent = '등록 확인 중...';

  try {
    const res = await confirmPayment(applicationId, null);
    if (res && res.success) {
      renderAlert('무료 부스 등록이 완료됐어요!', 'success');
      btn.textContent = '등록 완료됨';
    } else {
      renderAlert(res?.message || '등록 처리에 실패했어요. 고객센터에 문의해주세요.');
      btn.disabled = false;
      btn.textContent = originalText;
    }
  } catch (err) {
    console.error('무료 부스 등록 처리 오류:', err);
    renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ============================================
// 결제 버튼 클릭 -> 포트원 결제창 호출 -> 서버 검증
// ============================================
function handlePaymentClick() {
  const btn = document.getElementById('pay-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    hideAlert();

    const { applicationId, amount, orderName } = getPaymentParamsFromUrl();

    if (!applicationId) {
      renderAlert('신청 정보를 찾을 수 없어요. 부스 신청 화면부터 다시 진행해주세요.');
      return;
    }
    // amount가 음수이거나 숫자가 아닌 경우만 오류로 처리 (0원=무료 부스는 정상 케이스)
    if (amount == null || Number.isNaN(amount) || amount < 0) {
      renderAlert('결제 금액 정보가 올바르지 않아요.');
      return;
    }

    const original = btn.textContent;
    btn.disabled = true;

    // 무료 부스는 포트원 결제 자체를 건너뛰고 바로 서버에 등록 확정 요청
    if (amount === 0) {
      await handleFreeBoothConfirm(applicationId, btn, original);
      return;
    }

    if (typeof PortOne === 'undefined') {
      renderAlert('결제 모듈을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.');
      btn.disabled = false;
      btn.textContent = original;
      return;
    }

    btn.textContent = '결제창 여는 중...';

    // 결제마다 고유해야 하는 결제 ID (충돌 방지를 위해 applicationId + 타임스탬프 조합)
    const paymentId = `application-${applicationId}-${Date.now()}`;

    try {
      // 1) 포트원 결제창 호출
      const response = await PortOne.requestPayment({
        storeId: PORTONE_STORE_ID,
        channelKey: PORTONE_CHANNEL_KEY,
        paymentId: paymentId,
        orderName: orderName,
        totalAmount: amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        customer: {
          fullName: '판매자',
        },
      });

      // 결제 실패/취소 시 response.code가 존재함
      if (response == null || response.code != null) {
        renderAlert(response?.message || '결제가 취소되었어요.');
        btn.disabled = false;
        btn.textContent = original;
        return;
      }

      // 2) 결제 완료 -> 반드시 서버에 검증 요청 (프론트 응답만으로 완료 처리하지 않음)
      btn.textContent = '결제 확인 중...';
      const res = await confirmPayment(applicationId, paymentId);
      console.log("res")
      if (res && res.success) {
        renderAlert('결제가 완료됐어요!', 'success');
        btn.textContent = '결제 완료됨';
      } else {
        renderAlert(res?.message || '결제 검증에 실패했어요. 고객센터에 문의해주세요.');
        btn.disabled = false;
        btn.textContent = original;
      }
    } catch (err) {
      console.error('결제 처리 오류:', err);
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      btn.disabled = false;
      btn.textContent = original;
    }
    setTimeout(() => {
      window.location.href = '../B_host-seller/mybooth';
    }, 1000);
  });
}

// ============================================
// 초기 실행
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const { amount } = getPaymentParamsFromUrl();
  prefillPaymentAmount(amount);
  handlePaymentClick();
});