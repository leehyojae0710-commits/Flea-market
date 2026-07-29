// frontend/common/js/api.js
// 공통 API 호출 헬퍼 - 모든 페이지에서 이 함수를 통해 백엔드와 통신합니다.
// 응답 형식은 백엔드와 통일: { success, data, message }
//
// [세션/토큰 발급 보완] 변경 요약
//   기존 문제
//     1) 로그인 응답의 token 만 저장하고 만료 시각을 몰라서, 토큰이 죽어도 화면은 로그인 상태로 남았습니다.
//     2) 401 이 와도 공통 처리가 없어 각 페이지가 제각각 실패했습니다. (버튼만 안 먹는 현상)
//     3) 재발급 수단이 없어 만료되면 무조건 수동 재로그인이었습니다.
//   보완
//     1) 로그인/회원가입/재발급 응답을 가로채 token · refreshToken · 만료시각을 자동 저장 (saveSession)
//        -> auth.js 등 기존 파일을 고치지 않아도 동작합니다.
//     2) 요청 직전 만료 임박(60초 이내)이면 미리 재발급
//     3) 401(TOKEN_EXPIRED / SESSION_REVOKED) 이면 한 번만 재발급 후 자동 재시도
//     4) 재발급까지 실패하면 세션 정리 후 로그인 화면으로 이동 (원래 페이지로 복귀)
//
// 기존 호출 방식은 그대로입니다: callApi('/markets', { method: 'POST', body: payload })

const API_BASE_URL = 'http://localhost:5000/api';

/* ------------------------------------------------------------------ */
/* 세션 저장소                                                         */
/* ------------------------------------------------------------------ */

const SESSION_KEYS = {
  token: 'token',
  refreshToken: 'refreshToken',
  expiresAt: 'tokenExpiresAt',
  user: 'loggedInUser',
};

// 만료 몇 초 전부터 미리 갱신할지
const REFRESH_LEEWAY_SEC = 60;

// 재발급을 시도하지 않을 경로 (무한 루프 방지)
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

// 응답을 받으면 세션을 자동 저장할 경로
const SESSION_ISSUING_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

function pathStartsWithAny(path, list) {
  const clean = String(path).split('?')[0];
  return list.some((p) => clean === p || clean.indexOf(p) === 0);
}

function getAccessToken() {
  return sessionStorage.getItem(SESSION_KEYS.token);
}

function getRefreshToken() {
  return sessionStorage.getItem(SESSION_KEYS.refreshToken);
}

function getLoggedInUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.user);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('로그인 사용자 정보 파싱 실패:', error);
    return null;
  }
}

/**
 * 로그인/회원가입/재발급 응답의 data 를 세션에 저장합니다.
 * 서버가 refreshToken 을 내려주지 않는 환경(auth_sessions 미생성)에서도 안전하게 동작합니다.
 */
function saveSession(data) {
  if (!data) return;
  if (data.token) sessionStorage.setItem(SESSION_KEYS.token, data.token);
  if (data.refreshToken) sessionStorage.setItem(SESSION_KEYS.refreshToken, data.refreshToken);
  if (data.user) sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(data.user));

  // 만료 시각: expiresAt(ISO) 우선, 없으면 expiresIn(초)으로 계산
  if (data.expiresAt) {
    sessionStorage.setItem(SESSION_KEYS.expiresAt, String(new Date(data.expiresAt).getTime()));
  } else if (data.expiresIn) {
    sessionStorage.setItem(SESSION_KEYS.expiresAt, String(Date.now() + Number(data.expiresIn) * 1000));
  }
}

function clearSession() {
  Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
  sessionStorage.removeItem('viewRole'); // 다음 로그인에 화면 모드가 남지 않도록
}

/** 액세스 토큰 만료가 임박했는지 (만료 시각을 모르면 false) */
function isAccessTokenExpiring() {
  const raw = sessionStorage.getItem(SESSION_KEYS.expiresAt);
  if (!raw) return false;
  return Number(raw) - Date.now() < REFRESH_LEEWAY_SEC * 1000;
}

/* ------------------------------------------------------------------ */
/* 로그인 화면 이동                                                    */
/* ------------------------------------------------------------------ */

function getSiteRoot() {
  const path = window.location.pathname;
  const idx = path.toLowerCase().indexOf('/pages/');
  if (idx >= 0) return path.slice(0, idx);
  return path.replace(/\/[^/]*$/, '');
}

function isAuthPage() {
  const file = (window.location.pathname.split('/').pop() || '').toLowerCase();
  return file === 'login.html' || file === 'register.html';
}

/** 세션이 끊겼을 때 로그인 화면으로 보냅니다. (로그인/회원가입 화면에서는 이동하지 않음) */
function redirectToLogin(message) {
  if (isAuthPage()) return;
  if (message) alert(message);
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(getSiteRoot() + '/pages/A_auth-main/login.html?next=' + next);
}

/* ------------------------------------------------------------------ */
/* 토큰 재발급 (동시 요청은 1번만 호출되도록 묶음)                     */
/* ------------------------------------------------------------------ */

let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  // 여러 API가 동시에 401을 받아도 재발급은 한 번만 실행합니다.
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        console.warn('토큰 재발급 실패:', json.message || res.status);
        return false;
      }

      saveSession(json.data);
      return true;
    } catch (error) {
      console.error('토큰 재발급 중 네트워크 오류:', error);
      return false;
    } finally {
      // 다음 만료 때 다시 시도할 수 있도록 잠금을 풉니다.
      setTimeout(() => { refreshPromise = null; }, 0);
    }
  })();

  return refreshPromise;
}

/* ------------------------------------------------------------------ */
/* 공통 호출                                                           */
/* ------------------------------------------------------------------ */

async function callApi(path, { method = 'GET', body = null, headers: extraHeaders = null, _retried = false } = {}) {
  const skipRefresh = pathStartsWithAny(path, NO_REFRESH_PATHS);

  // 1) 만료 임박이면 요청 전에 미리 갱신 (401 을 아예 만들지 않는 쪽이 화면이 덜 끊깁니다)
  if (!skipRefresh && getAccessToken() && isAccessTokenExpiring() && getRefreshToken()) {
    await refreshAccessToken();
  }

  const token = getAccessToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  let json;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    json = await res.json();
  } catch (error) {
    // 네트워크 오류 / JSON 아닌 응답도 항상 같은 형태로 돌려줘서 호출부가 터지지 않게 합니다.
    console.error('API 통신 오류:', error);
    return { success: false, data: null, code: 'NETWORK_ERROR', message: '서버에 연결할 수 없습니다. 백엔드가 켜져 있는지 확인해 주세요.' };
  }

  // 2) 로그인/회원가입/재발급 응답이면 토큰을 자동 저장 (기존 페이지 코드를 고치지 않아도 됩니다)
  if (json.success && pathStartsWithAny(path, SESSION_ISSUING_PATHS)) {
    saveSession(json.data);
  }

  // 3) 세션 만료/폐기 처리
  if (res.status === 401 && !skipRefresh) {
    const code = json.code;
    const refreshable = code === 'TOKEN_EXPIRED' || code === 'SESSION_REVOKED' || !code;

    if (refreshable && !_retried && getRefreshToken()) {
      const ok = await refreshAccessToken();
      if (ok) {
        // 재발급 성공 -> 원래 요청 1회 재시도
        return callApi(path, { method, body, headers: extraHeaders, _retried: true });
      }
    }

    // 재발급 불가/실패 -> 세션 정리 후 로그인 화면으로
    if (getAccessToken() || getLoggedInUser()) {
      clearSession();
      redirectToLogin('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
    }
    return json;
  }

  if (!json.success) {
    console.error('API 오류:', json.message);
  }
  return json;
}

/* ------------------------------------------------------------------ */
/* 로그아웃 / 세션 확인                                                */
/* ------------------------------------------------------------------ */

// 공통 로그아웃 처리 (docs/naming-convention.md 함수명 규칙: logoutUser())
// [보완] 서버가 세션을 실제로 폐기하도록 refreshToken 도 같이 보냅니다.
//        서버 요청이 실패해도 사용자 입장에서는 로그아웃이 되어야 하므로 로컬 삭제는 항상 수행합니다.
async function logoutUser() {
  try {
    await callApi('/auth/logout', {
      method: 'POST',
      body: { refreshToken: getRefreshToken() },
    });
  } catch (error) {
    console.error('로그아웃 API 호출 오류:', error);
  } finally {
    clearSession();
  }
}

/** 모든 기기에서 로그아웃 */
async function logoutAllDevices() {
  try {
    await callApi('/auth/logout-all', { method: 'POST' });
  } finally {
    clearSession();
  }
}

/**
 * 페이지 진입 시 세션이 실제로 살아 있는지 서버에 확인합니다.
 * sessionStorage 값만 믿으면 "화면은 로그인 상태인데 API는 전부 401" 인 상황이 생깁니다.
 *
 * 사용 예 (로그인 필수 페이지 상단):
 *   ensureSession().then((user) => { if (user) renderPage(user); });
 *
 * @param {boolean} redirectIfInvalid 세션이 없으면 로그인 화면으로 보낼지 (기본 false)
 * @returns {Promise<object|null>} 최신 사용자 정보 또는 null
 */
async function ensureSession(redirectIfInvalid = false) {
  if (!getAccessToken() && !getRefreshToken()) {
    if (redirectIfInvalid) redirectToLogin();
    return null;
  }

  const result = await callApi('/auth/me');
  if (result.success && result.data?.user) {
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(result.data.user));
    return result.data.user;
  }

  clearSession();
  if (redirectIfInvalid) redirectToLogin();
  return null;
}

/* ------------------------------------------------------------------ */
/* 외부 공개                                                           */
/* ------------------------------------------------------------------ */

// 다른 파일에서 <script src="../../common/js/api.js"></script>로 불러와 사용하세요.
window.Session = {
  KEYS: SESSION_KEYS,
  getAccessToken,
  getRefreshToken,
  getLoggedInUser,
  saveSession,
  clearSession,
  refreshAccessToken,
  ensureSession,
  isAccessTokenExpiring,
  redirectToLogin,
};
