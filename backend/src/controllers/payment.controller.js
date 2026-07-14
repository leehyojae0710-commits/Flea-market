// 담당 D: 모의 결제 로직 (실 PG사 연동 없이 상태만 전환)

const processFakePayment = async (req, res) => {
  // TODO: applications.status 'approved' -> 'paid' 로 변경
  res.json({ success: true, data: null, message: 'processFakePayment 미구현' });
};

module.exports = {
  processFakePayment,
};
