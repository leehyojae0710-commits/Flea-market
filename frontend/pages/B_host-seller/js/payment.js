// 담당 B/D: 포트원 실결제 프론트 로직

// 📌 포트원 콘솔에서 발급받은 값으로 교체하세요
const PORTONE_STORE_ID="store-6187aa03-b350-43a3-96c7-31c846d1aa1c";
const PORTONE_CHANNEL_KEY="channel-key-15892876-53e7-45a8-8a44-923ec53d5ae1";

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
  if (!amountEl) return;
  amountEl.textContent = amount.toLocaleString();
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
    if (!amount || amount <= 0) {
      renderAlert('결제 금액 정보가 올바르지 않아요.');
      return;
    }
    if (typeof PortOne === 'undefined') {
      renderAlert('결제 모듈을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.');
      return;
    }

    const original = btn.textContent;
    btn.disabled = true;
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