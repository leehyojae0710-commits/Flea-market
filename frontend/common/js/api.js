// 공통 API 호출 헬퍼 - 모든 페이지에서 이 함수를 통해 백엔드와 통신합니다.
// 응답 형식은 백엔드와 통일: { success, data, message }

const API_BASE_URL = 'http://localhost:5000/api';

async function callApi(path, { method = 'GET', body = null } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    console.error('API 오류:', json.message);
  }
  return json;
}

// 다른 파일에서 <script src="../../common/js/api.js"></script>로 불러와 사용하세요.
