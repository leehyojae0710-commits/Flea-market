# 알림 기능 - 변경/신규 파일 모음

이 zip 안의 파일들을 프로젝트의 같은 상대 경로에 그대로 덮어쓰면 됩니다.
(예: `backend/server.js` -> 원래 프로젝트의 `backend/server.js` 위치에 덮어쓰기)

## 적용 순서

1. 아래 파일들을 각자 원래 경로에 덮어쓰기 (구조 그대로 유지되어 있음)
2. DB 마이그레이션 1회 실행
   ```
   cd backend
   node scripts/migrate-add-notifications.js
   ```
3. 백엔드 서버 재시작

## 알림이 발생하는 시점 (총 11가지)

| 상황 | 받는 사람 | 이동 위치(클릭 시) |
|---|---|---|
| 부스 신청 접수 | 주최자(host) | 내 마켓 관리 |
| 부스 신청 취소 | 주최자(host) | 내 마켓 관리 |
| 신청 승인 | 판매자(seller) | 내 부스 관리 |
| 신청 반려 | 판매자(seller) | 내 부스 관리 |
| 결제 완료 | 주최자(host) | 내 마켓 관리 |
| 환불 요청 | 주최자(host) | 내 마켓 관리 |
| 환불 완료(승인) | 판매자(seller) | 내 부스 관리 |
| 결제 기한 만료(자동) | 판매자(seller, 만료된 신청자) | 내 부스 관리 |
| 대기열 자동 승인(만료로 인한 승격) | 판매자(seller, 다음 순번) | 내 부스 관리 |
| 정산 금액 통보 | 결제 완료(Paid)한 판매자 전원 | 내 부스 관리 |

마지막 2개(자동 승인/만료)와 정산 통보는 원래 요청에는 없었지만, 신청/결제 흐름상
자연스럽게 알림이 필요한 지점이라 판단해 함께 추가했습니다. 필요 없으면
`backend/controllers/marketController.js`의 `processQueueTimeouts` /
`notifySettlement` 안 `createNotification(s)` 호출부만 지우면 됩니다.

## 신규 파일

- `backend/scripts/migrate-add-notifications.js` - notifications 테이블 생성
- `backend/services/notificationService.js` - 알림 생성 공통 헬퍼 (실패해도 본 기능 안 막음)
- `backend/controllers/notificationController.js` - 목록/안읽음개수/읽음처리 API
- `backend/routes/notificationRoutes.js` - `/api/notifications` 라우트

## 수정 파일

- `backend/server.js` - 알림 라우트 등록
- `backend/controllers/applicationController.js` - 신청/취소/승인/반려 지점에 알림 연결
- `backend/controllers/payController.js` - 결제완료/환불요청/환불완료 지점에 알림 연결
- `backend/controllers/marketController.js` - 대기열 타임아웃(만료/자동승인), 정산 통보 지점에 알림 연결
- `frontend/common/js/global-nav.js` - 종 버튼 팝업을 실제 API 연동으로 교체 (배지, 목록, 모두읽음, 클릭 시 이동)
- `frontend/common/css/global-nav.css` - 배지 · 알림 리스트 · 태그 스타일 추가
- 나머지 14개 HTML 페이지 - global-nav.css/js `?v=` 캐시 버전 1씩 증가 (내용 변경은 없음, 캐시 무효화 용도)

## 프론트 동작

- 로그인 상태일 때 45초마다 안읽은 개수를 폴링해서 종 버튼에 빨간 배지로 표시
- 종 버튼 클릭 시 최근 알림 최대 30건을 불러와 팝업에 표시 (타입 태그 + 상대 시간 + 안읽음 강조)
- 알림 클릭 시 해당 건을 읽음 처리하고, 알림의 `audience` 값에 따라 "내 마켓 관리" 또는 "내 부스 관리"로 이동
- "모두 읽음" 버튼으로 일괄 읽음 처리
- 로그인하지 않은 상태에서 종 버튼 클릭 시 로그인 화면으로 이동 (기존 동작 유지)
