// 공통 입력 형식 검증 유틸 - 여러 페이지(js/auth.js, js/mypage.js 등)에서 같이 사용합니다.
// 이 스크립트는 callApi를 쓰는 js 파일들보다 먼저 <script>로 불러와 주세요.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 010-0000-0000 형식 (010~019, 하이픈 필수, 중간 3~4자리)
const PHONE_REGEX = /^01[0-9]-\d{3,4}-\d{4}$/;

function isValidEmail(email) {
  return EMAIL_REGEX.test((email || '').trim());
}

function isValidPhone(phone) {
  return PHONE_REGEX.test((phone || '').trim());
}

// 한글/영문/숫자 2~12자 (공백 불가)
const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]{2,12}$/;

function isValidNickname(nickname) {
  return NICKNAME_REGEX.test((nickname || '').trim());
}
