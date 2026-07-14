# 함수명 / 코드 컨벤션

## 기본 원칙
- 함수는 **동사로 시작**, **camelCase** 사용 (`getUserData`, O / `UserDataGet`, X)
- 데이터 조작 동사 통일
  - 조회: `get...`
  - 생성: `create...`
  - 수정: `update...`
  - 삭제: `delete...`
  - 화면 렌더링: `render...`
  - 이벤트 처리: `handle...`

## 기능별 함수명 (프론트/백엔드 공통으로 이 이름 그대로 사용)

### 회원/인증 (담당 A, C)
- `registerUser()`
- `loginUser()`
- `logoutUser()`
- `updateUserProfile()`
- `deleteUserAccount()`
- `toggleUserRole()`

### 주최측/마켓 (담당 B, D, E)
- `createMarket()`
- `getMarketList()`
- `getMarketDetail()`
- `updateMarketStatus()`
- `approveSellerApplication()`
- `rejectSellerApplication()`

### 판매자/결제/소통 (담당 B, D, E)
- `applyForBooth()`
- `processFakePayment()`
- `createComment()`
- `getCommentList()`
- `generateEntranceQRCode()` (담당 E)

## 파일 분리 규칙 (충돌 방지)
- 같은 파일을 여러 명이 동시에 수정하지 않습니다. 기능 = 파일 단위로 쪼갭니다.
  - `auth.*` : 담당 A(프론트) / C(백엔드)
  - `market.*` : 담당 B(프론트) / C·D(백엔드)
  - `payment.*`, `comment.*` : 담당 B(프론트) / D(백엔드)
  - `map.js`, `qrcode.js` : 담당 E
- 공통 로직이 필요하면 `frontend/common/js/api.js` 또는 `backend/src/config/`에 추가하고 팀에 공지 후 커밋합니다.
