// backend/middleware/authMiddleware.js
// 로그인이 필요한 API를 보호하는 JWT 인증 미들웨어
//
// [세션/토큰 발급 보완] 변경점
//   1) JWT_SECRET 하드코딩 제거 -> utills/tokenService.js 한 곳에서만 관리
//   2) 401 응답에 code 를 추가해 "만료" 와 "위조/없음" 을 구분
//      -> 프론트(api.js)가 TOKEN_EXPIRED 일 때만 자동 재발급을 시도할 수 있습니다.
//   3) 로그아웃된 세션(sid)의 토큰은 만료 전이라도 거부
//      -> 기존에는 로그아웃해도 남은 기간 동안 토큰이 그대로 통했습니다.
//
// 기존 사용법(authenticateToken 을 라우트에 붙이고 req.user 를 쓰는 방식)은 그대로입니다.

import {
  extractBearerToken,
  verifyAccessToken,
  isSessionActive,
} from '../utills/tokenService.js';
// [JWT activeRole] 토큰에 실린 화면 모드를 req.user 로 옮겨 줍니다.
import { normalizeActiveRole, hasTokenActiveRole } from '../utills/rolePolicy.js';

/**
 * [JWT activeRole] 토큰 payload 를 req.user 형태로 정리합니다.
 *
 *   activeRole          : 항상 'host' | 'seller' (구버전 토큰이면 계정 종류로 보정)
 *   activeRoleFromToken : 토큰에 실제로 역할이 실려 있었는지
 *                         -> 이번 변경 이전에 발급된 토큰을 구분해서, 그동안만 쿼리 파라미터를 허용하기 위함
 */
function toRequestUser(payload) {
  return {
    ...payload,
    activeRole: normalizeActiveRole(payload.userType, payload.activeRole),
    activeRoleFromToken: hasTokenActiveRole(payload),
  };
}

/** 401 응답 형식을 한 곳에서 관리합니다. */
function unauthorized(res, code, message) {
  return res.status(401).json({ success: false, data: null, code, message });
}

/**
 * Authorization: Bearer <token> 헤더를 검사해서
 * 유효하면 req.user = { userId, userType, activeRole, sid } 를 채워주고 다음으로 넘깁니다.
 */
export async function authenticateToken(req, res, next) {
  const token = extractBearerToken(req);

  if (!token) {
    return unauthorized(res, 'TOKEN_MISSING', '로그인이 필요합니다.');
  }

  const result = verifyAccessToken(token);
  if (!result.ok) {
    return result.code === 'TOKEN_EXPIRED'
      ? unauthorized(res, 'TOKEN_EXPIRED', '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.')
      : unauthorized(res, 'TOKEN_INVALID', '토큰이 유효하지 않습니다.');
  }

  const payload = result.payload;

  // 로그아웃 처리된 세션인지 확인합니다.
  // auth_sessions 테이블이 없거나 sid 가 없는 구버전 토큰이면 통과시켜 하위 호환을 지킵니다.
  try {
    if (!(await isSessionActive(payload.sid))) {
      return unauthorized(res, 'SESSION_REVOKED', '로그아웃된 세션입니다. 다시 로그인해 주세요.');
    }
  } catch (error) {
    // DB 문제로 로그인 자체가 막히면 안 되므로 경고만 남기고 통과시킵니다.
    console.error('[authMiddleware] 세션 확인 실패(통과 처리):', error.message);
  }

  req.user = toRequestUser(payload); // { userId, userType, activeRole, sid, typ, iat, exp }
  next();
}

/**
 * [추가] 로그인해도 되고 안 해도 되는 API용.
 * 토큰이 있으면 req.user 를 채우고, 없거나 틀려도 401 없이 그냥 넘어갑니다.
 * (예: 마켓 목록에서 로그인 사용자면 "내 신청 여부"를 같이 보여주고 싶을 때)
 */
export async function optionalAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return next();

  const result = verifyAccessToken(token);
  if (!result.ok) return next();

  try {
    if (await isSessionActive(result.payload.sid)) req.user = toRequestUser(result.payload);
  } catch (error) {
    console.error('[authMiddleware] optionalAuth 세션 확인 실패:', error.message);
  }
  next();
}

export default authenticateToken;
