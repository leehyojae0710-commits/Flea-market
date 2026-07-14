// 담당 D: 부스 신청 비즈니스 로직

const applyForBooth = async (req, res) => {
  // TODO: market_id, seller_id, booth_number, product_image, product_desc 저장 (status='pending')
  res.json({ success: true, data: null, message: 'applyForBooth 미구현' });
};

const approveSellerApplication = async (req, res) => {
  // TODO: applications.status = 'approved' 로 변경
  res.json({ success: true, data: null, message: 'approveSellerApplication 미구현' });
};

const rejectSellerApplication = async (req, res) => {
  // TODO: applications.status = 'rejected' 로 변경
  res.json({ success: true, data: null, message: 'rejectSellerApplication 미구현' });
};

module.exports = {
  applyForBooth,
  approveSellerApplication,
  rejectSellerApplication,
};
