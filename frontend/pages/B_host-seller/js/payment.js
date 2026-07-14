// 담당 B/D: 모의 결제 프론트 로직

async function processFakePayment(applicationId) {
  return callApi('/payments/fake', { method: 'POST', body: { applicationId } });
}

function handleFakePaymentClick() {
  const btn = document.getElementById('fake-payment-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const applicationId = new URLSearchParams(window.location.search).get('applicationId');
    const { success } = await processFakePayment(applicationId);
    if (success) alert('결제가 완료되었습니다.');
  });
}

document.addEventListener('DOMContentLoaded', handleFakePaymentClick);
