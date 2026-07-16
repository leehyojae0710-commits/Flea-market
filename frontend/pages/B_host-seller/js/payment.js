// 담당 B/D: 모의 결제 프론트 로직

async function processFakePayment(applicationId) {
  return callApi('/payments/fake', { method: 'POST', body: { applicationId } });
}

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

function prefillPaymentAmount() {
  const amountEl = document.getElementById('amount');
  if (!amountEl) return;
  const params = new URLSearchParams(window.location.search);
  const amount = Number(params.get('amount')) || 0;
  amountEl.textContent = amount.toLocaleString();
}

function handleFakePaymentClick() {
  const btn = document.getElementById('fake-payment-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    hideAlert();
    const applicationId = new URLSearchParams(window.location.search).get('applicationId');
    if (!applicationId) {
      renderAlert('신청 정보를 찾을 수 없어요. 부스 신청 화면부터 다시 진행해주세요.');
      return;
    }

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '처리 중...';
    try {
      const res = await processFakePayment(applicationId);
      if (res && res.success) {
        renderAlert('결제가 완료됐어요!', 'success');
        btn.textContent = '결제 완료됨';
      } else {
        renderAlert(res?.message || '결제 처리에 실패했어요.');
        btn.disabled = false;
        btn.textContent = original;
      }
    } catch (err) {
      renderAlert('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  prefillPaymentAmount();
  handleFakePaymentClick();
});
