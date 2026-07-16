# API 주소(Route) 규칙

기능 명사 기준, 소문자 + 하이픈(-) 사용. 아래 표에 없는 API를 새로 만들 때도 이 규칙을 따릅니다.

| 기능 | URI | Method | 담당 |
|---|---|---|---|
| 회원가입 | `/api/auth/register` | POST | C |
| 로그인 | `/api/auth/login` | POST | C |
| 로그아웃 | `/api/auth/logout` | POST | C |
| 회원정보 수정 | `/api/users/me` | PATCH | C |
| 회원 탈퇴 | `/api/users/me` | DELETE | C |
| 권한(Role) 전환 | `/api/auth/toggle-role` | PATCH | C |
| 마켓 목록 조회(필터/정렬) | `/api/markets` | GET | C |
| 마켓 상세 조회 | `/api/markets/:marketId` | GET | C |
| 마켓 등록 | `/api/markets` | POST | D |
| 셀러 신청 목록 조회 | `/api/markets/:marketId/applications` | GET | D |
| 부스 신청 | `/api/applications` | POST | D |
| 신청 승인 | `/api/applications/:applicationId/approve` | PATCH | D |
| 신청 반려 | `/api/applications/:applicationId/reject` | PATCH | D |
| 모의 결제 처리 | `/api/payments/fake` | POST | D |
| 댓글 등록 | `/api/comments` | POST | D |
| 댓글 목록 조회 | `/api/comments?targetId=` | GET | D |
| 내 일정 조회 | `/api/schedules/me` | GET | D |
| 지도 좌표 저장 | `/api/markets/:marketId/location` | PATCH | E |
| QR 코드 발급 | `/api/checkins/:userId/qrcode` | GET | E |

공통 규칙:
- 목록 조회는 항상 GET + 복수형 명사 (`/markets`, `/comments`)
- 생성은 POST, 부분 수정은 PATCH, 삭제는 DELETE
- 응답은 항상 `{ success: boolean, data: ..., message: string }` 형태로 통일
