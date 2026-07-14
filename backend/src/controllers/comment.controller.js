// 담당 D: 댓글 비즈니스 로직

const createComment = async (req, res) => {
  // TODO: targetType, targetId, writerId, content 저장
  res.json({ success: true, data: null, message: 'createComment 미구현' });
};

const getCommentList = async (req, res) => {
  // TODO: targetType + targetId 로 댓글 목록 조회
  res.json({ success: true, data: [], message: 'getCommentList 미구현' });
};

module.exports = {
  createComment,
  getCommentList,
};
