// backend/middleware/roleGuard.js
// [C-01] 판매자 계정의 주최자 영역 접근 차단 (단방향 역할 정책)
//
// 정책
//   userType 1 = 주최자 : 주최자 API + 판매자 API 모두 사용 가능
//   userType 0 = 판매자 : 주최자 API 사용 불가 (주최자 전환도 불가)
//
// 프론트 가드(role-routing.js)만으로는 주소창 직접 입력 / API 직접 호출을 막을 수 없어서
// 서버에서도 같은 규칙을 한 번 더 검사합니다.
//
// [세션/토큰 발급 보완] 변경점
//   - JWT_SECRET 하드코딩과 jwt.verify 직접 호출을 제거하고 utills/tokenService.js 를 사용합니다.
//     (시크릿이 3개 파일에 흩어져 있어 한 곳만 바꾸면 인증이 어긋나던 문제를 정리)
//   - 그 외 가드 로직/내보내는 함수는 기존과 동일합니다.
//
// [JWT activeRole 보완 - A안] 변경점
//   - 인가(권한 검사)는 지금처럼 계정 종류(userType)만 봅니다. 화면 모드(activeRole)로 API를 막지 않습니다.
//     -> 주최자가 판매자 모드로 보고 있어도 주최자 API는 계속 동작합니다. (기존 UX 유지)
//   - activeRole 은 표시/통계 분기용으로만 쓰고, 값은 rolePolicy.getActiveRole(req) 로 읽습니다.

import { verifyAccessToken, extractBearerToken } from '../utills/tokenService.js';
// [JWT activeRole] 역할 상수/판정 규칙은 utills/rolePolicy.js 한 곳에서 관리합니다.
//   기존에 이 파일이 직접 갖고 있던 USER_TYPE / isHostType 은 그대로 다시 내보내므로
//   authRoutes 등 기존 import 구문은 고칠 필요가 없습니다.
import {
  USER_TYPE,
  isHostType,
  normalizeActiveRole,
  getActiveRole,
  isHostView,
} from '../utills/rolePolicy.js';

export { USER_TYPE, isHostType, normalizeActiveRole, getActiveRole, isHostView };

/**
 * 라우트 단위 가드.
 * authenticateToken 다음에 붙여 사용합니다. (hostOnlyMiddleware.requireHost 와 동일 역할)
 */
export function requireHostAccount(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, data: null, code: 'TOKEN_MISSING', message: '로그인이 필요합니다.' });
  }
  if (!isHostType(req.user.userType)) {
    return res.status(403).json({
      success: false,
      data: null,
      message: '판매자 계정은 주최자 기능을 이용할 수 없습니다.',
    });
  }
  next();
}

/**
 * 주최자 전용 API 경로 목록.
 * { method: 'GET' | 'POST' | ... | 'ANY', pattern: 정규식 } 형태이며,
 * pattern 은 /api 를 뺀 경로에 매칭합니다. (예: /markets/mine)
 * 새 주최자 API가 생기면 여기에 한 줄만 추가하면 됩니다.
 */
export const HOST_ONLY_ENDPOINTS = [
  { method: 'GET', pattern: /^\/markets\/mine\/?$/ },                       // 내 마켓 목록
  { method: 'POST', pattern: /^\/markets\/?$/ },                            // 마켓 등록
  { method: 'GET', pattern: /^\/markets\/\d+\/settlement\/?$/ },            // 정산 조회
  { method: 'PATCH', pattern: /^\/markets\/\d+\/settlement/ },              // 정산 처리
  { method: 'PATCH', pattern: /^\/applications\/\d+\/(approve|reject)\/?$/ }, // 신청 승인/반려
];

function matchesHostOnly(method, path) {
  return HOST_ONLY_ENDPOINTS.some(
    (rule) => (rule.method === 'ANY' || rule.method === method) && rule.pattern.test(path)
  );
}

/**
 * 앱 전역 가드.
 * server.js 에서 라우터 등록 "앞"에 app.use(hostAreaGuard) 로 한 번만 걸어두면
 * 위 목록의 API를 판매자 토큰으로 호출할 때 403을 돌려줍니다.
 *
 * - 토큰이 없거나 깨진 경우엔 여기서 막지 않고 각 라우터의 authenticateToken 이 401을 내도록 통과시킵니다.
 * - 소유자 검증(내 마켓인지)은 기존 컨트롤러 로직을 그대로 사용합니다.
 */
export function hostAreaGuard(req, res, next) {
  const path = req.path.replace(/^\/api/, '');
  if (!matchesHostOnly(req.method, path)) return next();

  const token = extractBearerToken(req);
  if (!token) return next(); // 인증 실패 처리는 라우터에 위임

  const result = verifyAccessToken(token);
  if (!result.ok) return next(); // 만료/위조 토큰도 라우터의 401 처리에 맡깁니다.

  if (!isHostType(result.payload.userType)) {
    return res.status(403).json({
      success: false,
      data: null,
      message: '판매자 계정은 주최자 기능을 이용할 수 없습니다.',
    });
  }

  next();
}

export default hostAreaGuard;
