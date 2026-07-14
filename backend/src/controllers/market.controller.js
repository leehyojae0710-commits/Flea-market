// 마켓(공고) 비즈니스 로직

const getMarketList = async (req, res) => {
  // TODO(담당 C): event_date >= 오늘 조건, 지역/마감순 정렬 쿼리스트링 처리
  res.json({ success: true, data: [], message: 'getMarketList 미구현' });
};

const getMarketDetail = async (req, res) => {
  // TODO(담당 C): markets.id 로 상세 조회
  res.json({ success: true, data: null, message: 'getMarketDetail 미구현' });
};

const createMarket = async (req, res) => {
  // TODO(담당 D): 주최측 공고 등록
  res.json({ success: true, data: null, message: 'createMarket 미구현' });
};

const getApplicationsByMarket = async (req, res) => {
  // TODO(담당 D): 특정 마켓에 신청한 셀러 목록 조회
  res.json({ success: true, data: [], message: 'getApplicationsByMarket 미구현' });
};

const updateMarketLocation = async (req, res) => {
  // TODO(담당 E): 지도 API에서 받은 위경도(latitude, longitude) 저장
  res.json({ success: true, data: null, message: 'updateMarketLocation 미구현' });
};

module.exports = {
  getMarketList,
  getMarketDetail,
  createMarket,
  getApplicationsByMarket,
  updateMarketLocation,
};
