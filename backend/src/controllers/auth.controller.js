// 담당 C: 회원/인증 비즈니스 로직
// 함수명은 docs/naming-convention.md 규칙을 따릅니다.

const registerUser = async (req, res) => {
  // TODO: email/password/phone/region 검증 후 bcrypt 해시, users 테이블 저장
  res.json({ success: true, data: null, message: 'registerUser 미구현' });
};

const loginUser = async (req, res) => {
  // TODO: 이메일/비밀번호 확인 후 JWT 발급
  res.json({ success: true, data: null, message: 'loginUser 미구현' });
};

const logoutUser = async (req, res) => {
  // TODO: 세션/토큰 무효화
  res.json({ success: true, data: null, message: 'logoutUser 미구현' });
};

const toggleUserRole = async (req, res) => {
  // TODO: users.active_role 을 host <-> seller 로 전환
  res.json({ success: true, data: null, message: 'toggleUserRole 미구현' });
};

const updateUserProfile = async (req, res) => {
  // TODO: 비밀번호/주소/전화번호 수정
  res.json({ success: true, data: null, message: 'updateUserProfile 미구현' });
};

const deleteUserAccount = async (req, res) => {
  // TODO: 회원 탈퇴 처리 (데이터 삭제 또는 비식별화)
  res.json({ success: true, data: null, message: 'deleteUserAccount 미구현' });
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  toggleUserRole,
  updateUserProfile,
  deleteUserAccount,
};
