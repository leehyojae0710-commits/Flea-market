// backend/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'flea-market-dev-secret-change-me';

// 로그인 필수인 API용 (없으면 401 에러)
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: '토큰이 만료되었거나 유효하지 않습니다.' });
  }
}

// 로그인 선택적인 API용 (토큰 없거나 잘못돼도 그냥 통과, req.user만 안 채워짐)
export function attachUserIfLoggedIn(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      req.user = null; // 토큰이 이상해도 에러 내지 않고 그냥 비로그인 취급
    }
  } else {
    req.user = null;
  }

  next();
}