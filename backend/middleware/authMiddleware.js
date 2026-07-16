// backend/middleware/authMiddleware.js
// 로그인이 필요한 API를 보호하는 JWT 인증 미들웨어
// 신규 파일이라 기존 코드와 충돌하지 않습니다.

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'flea-market-dev-secret-change-me';

/**
 * Authorization: Bearer <token> 헤더를 검사해서
 * 유효하면 req.user = { userId, userType } 를 채워주고 다음으로 넘깁니다.
 * 없거나 유효하지 않으면 401을 반환합니다.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, data: null, message: '로그인이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(401).json({ success: false, data: null, message: '토큰이 유효하지 않거나 만료되었습니다.' });
    }
    req.user = payload; // { userId, userType, iat, exp }
    next();
  });
}

// 로그인 선택적 API용 (토큰 없거나 무효해도 그냥 통과, req.user만 채워짐)
export function attachUserIfLoggedIn(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}