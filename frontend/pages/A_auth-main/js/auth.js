const loginForm = document.getElementById('loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 이메일 입력란과 비밀번호 입력란 가져오기
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    if (!emailInput || !passwordInput) return;

    // 💡 로그인 창에서 입력받은 '이메일 값'을 백엔드의 'userId'로 전송하여 조회하도록 대조합니다.
    const userId = emailInput.value; 
    const password = passwordInput.value;

    try {
      // common/js/api.js의 callApi 함수 호출
      const result = await callApi('/auth/login', {
        method: 'POST',
        body: { userId, password }
      });

      if (result.success) {
        alert(result.message || '로그인 성공!');

        // 로그인 데이터 로컬에 보관 (JWT 토큰)
        if (result.data) {
          localStorage.setItem('token', result.data.token);
          localStorage.setItem('loggedInUser', JSON.stringify(result.data.user));
          
          // 역할에 따라 화면 이동
          if (result.data.user.activeRole === 'host') {
            window.location.href = '../B_host-seller/market-create.html';
          } else {
            window.location.href = '../B_host-seller/market-detail.html';
          }
        }
      } else {
        alert(result.message || '로그인 실패: 아이디 혹은 비밀번호를 확인하세요.');
      }
    } catch (err) {
      console.error('로그인 에러:', err);
      alert('서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.');
    }
  });
}