// 공통 API 호출 헬퍼 - 모든 페이지에서 이 함수를 통해 백엔드와 통신합니다.
// 응답 형식은 백엔드와 통일: { success, data, message }

const API_BASE_URL = 'http://localhost:5000/api';

async function callApi(path, { method = 'GET', body = null } = {}) {
  const token = sessionStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    console.error('API 오류:', json.message);
  }
  return json;
}

// 다른 파일에서 <script src="../../common/js/api.js"></script>로 불러와 사용하세요.

// 공통 로그아웃 처리 (docs/naming-convention.md 함수명 규칙: logoutUser())
// [수정] 서버에 POST /auth/logout 라우트가 신설되어 이를 먼저 호출합니다.
// 서버 요청이 실패(네트워크 오류 등)하더라도 사용자 입장에서는 로그아웃이 되어야 하므로
// try/catch로 감싸고, 로컬 토큰 삭제는 항상(finally) 수행합니다.
async function logoutUser() {
  try {
    await callApi('/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('로그아웃 API 호출 오류:', error);
  } finally {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('loggedInUser');
  }
}
