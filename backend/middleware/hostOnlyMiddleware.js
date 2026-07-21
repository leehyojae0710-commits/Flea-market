// backend/middleware/hostOnlyMiddleware.js
// [담당 D 신규] 작성자(주최자) 권한 확인 미들웨어
// - authenticateToken 이후에 붙여서 사용합니다. (req.user 가 채워져 있어야 함)
// - users.userType: 0 = 판매자, 1 = 주최자
// - 신규 파일이라 기존 authMiddleware.js 는 건드리지 않습니다.

export function requireHost(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, data: null, message: '로그인이 필요합니다.' });
  }

  if (Number(req.user.userType) !== 1) {
    return res.status(403).json({ success: false, data: null, message: '주최자만 이용할 수 있는 기능입니다.' });
  }

  next();
}
