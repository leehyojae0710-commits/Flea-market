// backend/utills/rolePolicy.js
// [JWT activeRole 포함/재발급 보완 - 신규 파일]
//
// 왜 만들었나
//   normalizeActiveRole 규칙이 routes/authRoutes.js 안에만 있어서
//   tokenService / authMiddleware / profileController 가 같은 규칙을 쓸 수 없었습니다.
//   그래서 "로그인 응답의 activeRole"과 "토큰 안의 activeRole"이 서로 달라질 여지가 있었습니다.
//
// 이 파일은 다른 모듈을 import 하지 않습니다. (tokenService <-> roleGuard 순환 참조 방지)
//
// [적용 방침 - A안]
//   activeRole 은 "지금 어떤 화면 모드로 보고 있는지"를 나타내는 값입니다.
//   인가(권한 검사)는 지금처럼 계정 종류(userType) 기준을 그대로 유지하고,
//   activeRole 은 UI 분기 / 통계 분기 / 감사 로그 용도로만 씁니다.
//   -> 판매자 모드로 전환했다고 해서 주최자 API가 갑자기 403이 되지는 않습니다.

export const USER_TYPE = { SELLER: 0, HOST: 1 };
export const ROLE = { HOST: 'host', SELLER: 'seller' };

/** userType 값이 주최자인지 판정 (문자열로 들어와도 안전) */
export function isHostType(userType) {
  return Number(userType) === USER_TYPE.HOST;
}

/**
 * activeRole 정규화
 *  - 판매자 계정(userType 0): 어떤 값이 들어 있어도 항상 'seller'
 *  - 주최자 계정(userType 1): 'seller' 로 명시된 경우에만 'seller', 그 외(NULL/빈값/이상값)는 'host'
 *
 * NULL 을 host 로 보는 이유:
 *   users.activeRole 컬럼의 기존 기본값이 'seller' 라서 신규 주최자 계정이 전부 seller 로 들어가 있었습니다.
 *   기본값을 NULL 로 바꾸고, NULL 이면 계정 종류를 따르도록 해서 "주최자로 가입 -> 주최자 모드" 를 보장합니다.
 */
export function normalizeActiveRole(userType, activeRole) {
  if (!isHostType(userType)) return ROLE.SELLER;
  return String(activeRole).toLowerCase() === ROLE.SELLER ? ROLE.SELLER : ROLE.HOST;
}

/** 토큰 payload 안에 activeRole 이 실제로 들어 있는지 (이번 변경 이전에 발급된 토큰 구분용) */
export function hasTokenActiveRole(payload) {
  const value = payload && payload.activeRole;
  return value === ROLE.HOST || value === ROLE.SELLER;
}

/** 요청의 화면 모드. 구버전 토큰이면 계정 종류를 따릅니다. */
export function getActiveRole(req) {
  if (!req || !req.user) return null;
  return normalizeActiveRole(req.user.userType, req.user.activeRole);
}

/** 지금 주최자 모드로 보고 있는지 (표시/통계 분기용. 인가 판정에는 쓰지 않습니다) */
export function isHostView(req) {
  return getActiveRole(req) === ROLE.HOST;
}

export default {
  USER_TYPE,
  ROLE,
  isHostType,
  normalizeActiveRole,
  hasTokenActiveRole,
  getActiveRole,
  isHostView,
};
