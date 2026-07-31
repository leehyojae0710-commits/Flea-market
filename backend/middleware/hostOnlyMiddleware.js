// backend/middleware/hostOnlyMiddleware.js
// [담당 D] 작성자(주최자) 권한 확인 미들웨어
// - authenticateToken 이후에 붙여서 사용합니다. (req.user 가 채워져 있어야 함)
// - users.userType: 0 = 판매자, 1 = 주최자
//
// [단방향 전환 규칙 검증] 변경점
//   기존에는 이 파일이 Number(req.user.userType) !== 1 을 직접 검사했습니다.
//   roleGuard.requireHostAccount 가 같은 일을 하는데 구현이 둘로 나뉘어 있어서
//     - 판정 규칙이 갈라질 수 있고 (한쪽만 고치면 어긋남)
//     - 같은 차단인데 에러 메시지가 달라 프론트가 분기하기 어려웠습니다.
//   이제 roleGuard 로 위임합니다. import 구문과 함수명은 그대로라 호출부는 고칠 필요가 없습니다.

import { requireHostAccount } from './roleGuard.js';

/**
 * 주최자 계정만 통과시킵니다. (판매자 -> 주최자 단방향 정책)
 * 실제 판정은 roleGuard.requireHostAccount 한 곳에서만 합니다.
 */
export function requireHost(req, res, next) {
  return requireHostAccount(req, res, next);
}

export default requireHost;
