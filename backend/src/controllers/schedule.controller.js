// 담당 D: 로그인 유저의 역할(host/seller)에 맞춰 일정 조회

const getMySchedule = async (req, res) => {
  // TODO: active_role === 'host' 면 내가 주최하는 markets,
  //       active_role === 'seller' 면 내가 참가 승인된 applications 기준으로 조회
  res.json({ success: true, data: [], message: 'getMySchedule 미구현' });
};

module.exports = {
  getMySchedule,
};
