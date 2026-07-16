# Flea-market (플리마켓 매칭 플랫폼)

5인 팀 · 3주 완성 목표 · 프론트엔드 2명 / 백엔드·DB 2명 / 외부연동·통합 1명

> 스택 가정: **Node.js(Express) 백엔드 + 순수 HTML/CSS/JS 프론트엔드**, DB는 MySQL 가정.
> (React나 다른 DB를 쓰기로 했다면 폴더 구조는 그대로 두고 내부 코드만 바꾸면 됩니다.)

## 최초 진입 화면

로그인이 아니라 **`frontend/index.html`(개최 중인 플리마켓 목록)** 이 첫 화면입니다.
로그인 없이 마켓을 둘러볼 수 있고, "마켓 등록하기"처럼 로그인이 필요한 동작을 누를 때만 로그인 페이지로 이동합니다.
백엔드(담당 C·D)가 아직 없어도 목데이터로 동작하도록 만들어 두었으니, `npx serve frontend` 또는 VS Code Live Server로 `frontend/index.html`을 열면 바로 확인할 수 있습니다.

## 팀원별 담당 폴더

| 담당 | 역할 | 작업 폴더 |
|---|---|---|
| A | 회원/로그인/마이페이지/첫화면 (프론트) | `frontend/pages/A_auth-main/` |
| B | 주최측/판매자 화면 (프론트) | `frontend/pages/B_host-seller/` |
| C | DB 설계 + 회원 인증 + 메인 필터 API (백엔드) | `backend/src/routes/auth.routes.js`, `market.routes.js`(조회), `models/` |
| D | 부스신청/결제/댓글/일정 API (백엔드) | `backend/src/routes/application.routes.js`, `payment.routes.js`, `comment.routes.js` |
| E | 지도/QR 연동 + 프론트-백 통합 | `integration/`, 매주 코드 병합 담당 |

## 충돌 방지 규칙 (필독)

1. **파일을 역할별로 쪼갰기 때문에 원칙적으로 남의 폴더 파일은 건드리지 않습니다.**
   공통 함수가 필요하면 `frontend/common/` 또는 `backend/src/config/`에 추가하고 팀 채팅에 공지합니다.
2. **작업 시작 전 무조건 `git pull origin main`** 부터 하고 코딩을 시작합니다.
3. API 주소 규칙과 함수명 규칙은 `docs/naming-convention.md`, `docs/api-routes.md`를 따릅니다.
4. 커밋은 의미 단위로 잘게: `git add . && git commit -m "설명" && git push`

## 실행 방법 (초안)

```bash
# 백엔드
cd backend
npm install
npm run dev      # nodemon으로 src/app.js 실행 (package.json 참고)

# 프론트엔드는 별도 서버 없이 frontend/pages/**/*.html을
# VS Code Live Server 확장으로 열어서 확인하면 됩니다.
```

## 폴더 구조

```
flea-market/
├── frontend/
│   ├── pages/
│   │   ├── A_auth-main/      # 담당 A
│   │   ├── B_host-seller/    # 담당 B
│   │   └── (공통은 frontend/common 참고)
│   └── common/
│       ├── css/style.css
│       └── js/api.js         # 공통 fetch 헬퍼
├── backend/
│   └── src/
│       ├── routes/           # API 주소 정의 (담당 C, D)
│       ├── controllers/      # 실제 로직 (담당 C, D)
│       ├── models/           # DB 스키마 (담당 C)
│       ├── config/db.js
│       └── app.js
├── integration/               # 담당 E: 지도, QR
├── docs/
│   ├── api-routes.md
│   └── naming-convention.md
└── README.md
```
