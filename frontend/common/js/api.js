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
// POST /api/auth/logout 은 서버 쪽 기록용이라 실패해도 무시하고, 항상 로컬 토큰은 지웁니다.
async function logoutUser() {
  const token = sessionStorage.getItem('token');
  if (token) {
    try {
      await callApi('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('로그아웃 API 호출 실패(무시하고 로컬 로그아웃 진행):', e);
    }
  }
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('loggedInUser');
}
