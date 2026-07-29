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

// 비밀번호: 8자 이상 + 영문 소문자 최소 1개 + 특수문자 최소 1개 포함
// [규칙이 늘어나면 이 상수들만 수정하면 됩니다. 서버쪽 registerValidationMiddleware.js도 같이 맞춰주세요.]
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

function isValidPassword(password) {
  const value = password || '';
  return (
    value.length >= PASSWORD_MIN_LENGTH &&
    PASSWORD_LOWERCASE_REGEX.test(value) &&
    PASSWORD_SPECIAL_REGEX.test(value)
  );
}

// 입력 중 실시간으로 보여줄 비밀번호 규칙 안내 메시지
// - 위반된 규칙이 여러 개면 우선순위대로 하나만 보여줍니다 (길이 -> 소문자 포함 -> 특수문자 포함).
function getPasswordRuleMessage(password) {
  const value = password || '';
  if (value.length === 0) return '';
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다. (현재 ${value.length}자)`;
  }
  if (!PASSWORD_LOWERCASE_REGEX.test(value)) {
    return '비밀번호에 영문 소문자를 1개 이상 포함해주세요.';
  }
  if (!PASSWORD_SPECIAL_REGEX.test(value)) {
    return '비밀번호에 특수문자를 1개 이상 포함해주세요. (예: ! @ # $ %)';
  }
  return '사용할 수 있는 비밀번호예요.';
}
