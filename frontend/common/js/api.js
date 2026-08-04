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
// [로그아웃 처리 보완] 이번 변경분 (파일 아래쪽 "로그아웃 UI" 구역)
//   기존 문제
//     1) 로그아웃 버튼이 index.html / profile-edit.html 두 곳에만 있어,
//        마이마켓·부스 신청·결제 등 다른 화면에서는 로그아웃할 방법이 없었습니다.
//     2) logoutAllDevices() 와 GET /auth/sessions 는 만들어 놨지만 호출하는 화면이 없어
//        "코드는 있는데 쓸 수 없는" 상태였습니다.
//     3) 로그아웃 후 화면 전환이 없어, 로그인 상태로 그려진 UI 잔여물이 남았습니다.
//     4) 회원 탈퇴 등에서 sessionStorage 를 부분만 지워 refreshToken/viewRole 이 남았습니다.
//   보완
//     1) header 가 있는 모든 페이지에 로그아웃 버튼 자동 삽입 (이미 버튼이 있으면 건드리지 않음)
//     2) 마이페이지 / 내 정보 수정 화면에 「세션 관리」 버튼 + 기기 목록 모달 + 전체 로그아웃
//     3) 로그아웃 완료 후 홈으로 이동 (중복 실행 방지 플래그 포함)
//     4) 페이지 로드 시 깨진 세션키(토큰 없이 refreshToken 만 남은 상태) 자동 정리
//   ※ 이 파일은 모든 페이지가 이미 불러오고 있어서, HTML 을 한 줄도 고칠 필요가 없습니다.
//
// [JWT activeRole 보완] 이번 변경분
//   - SESSION_ISSUING_PATHS 에 '/auth/toggle-role' 추가 (전환 시 재발급된 토큰 자동 저장)
//   - 나머지 동작은 그대로입니다.
//
// 기존 호출 방식은 그대로입니다: callApi('/markets', { method: 'POST', body: payload })

/* ------------------------------------------------------------------ */
/* API 주소 결정                                                       */
/* ------------------------------------------------------------------ */
//
// [보안·환경 정리] 예전에는 이 파일과 다른 4개 파일에 'http://localhost:5000/api' 가
//   총 9군데 하드코딩돼 있었습니다. 배포할 때 전부 찾아 고쳐야 하고, 하나만 빠뜨려도
//   운영 화면이 개발 PC 를 호출합니다. 그래서 주소 결정을 여기 한 곳으로 모았습니다.
//
// 우선순위
//   1) window.__API_BASE_URL__       배포 스크립트가 주입 (가장 강함)
//   2) <meta name="api-base-url">    HTML 한 줄로 지정
//   3) 현재 접속한 호스트의 5000 포트  (기본값. 팀원끼리 IP 로 접속해도 알아서 맞춰짐)
//   4) http://localhost:5000/api     파일을 직접 열었을 때(file://) 폴백
//
// 배포 시에는 3번이 그대로 동작하거나, 백엔드가 정적 파일까지 서빙하면
// 같은 오리진의 /api 를 자동으로 씁니다. 고칠 곳은 이 함수 하나뿐입니다.
function resolveApiBaseUrl() {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    if (typeof window === 'undefined') return 'http://localhost:5000/api';

    if (window.__API_BASE_URL__) {
      return String(window.__API_BASE_URL__).replace(/\/+$/, '');
    }

    var meta = document.querySelector('meta[name="api-base-url"]');
    if (meta && meta.content) {
      return meta.content.replace(/\/+$/, '');
    }

    var loc = window.location;
    // 파일을 더블클릭해서 연 경우(file://) 에는 호스트가 없습니다.
    if (loc.protocol === 'file:' || !loc.hostname) {
      return 'http://localhost:5000/api';
    }

    // 백엔드가 프론트까지 서빙하는 배포 형태면 같은 오리진을 씁니다.
    if (loc.port === '5000' || loc.port === '') {
      return loc.origin + '/api';
    }

    // Live Server(5500 등)로 열었을 때: 같은 호스트의 5000 포트가 백엔드입니다.
    return loc.protocol + '//' + loc.hostname + ':5000/api';
  }
  else {
    return 'http://3.106.226.93:5000/api';
  }
}

const API_BASE_URL = resolveApiBaseUrl();

/**
 * API·업로드 파일의 전체 주소를 만듭니다.
 * callApi 를 쓰지 않는 곳(FormData 업로드, <img src>)에서 사용하세요.
 *   apiUrl('/upload')          -> http://localhost:5000/api/upload
 *   apiUrl('/images/a.png')    -> http://localhost:5000/api/images/a.png
 */
function apiUrl(path) {
  var p = String(path || '');
  if (/^https?:\/\//i.test(p)) return p; // 이미 전체 주소면 그대로
  if (p && p.charAt(0) !== '/') p = '/' + p;
  return API_BASE_URL + p;
}

if (typeof window !== 'undefined') {
  window.API_BASE_URL = API_BASE_URL;
  window.apiUrl = apiUrl;
}

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
// [JWT activeRole] /auth/toggle-role 추가:
//   역할 전환 응답에 "새 역할이 반영된 액세스 토큰"이 함께 오므로, 여기서 자동으로 갈아끼웁니다.
//   이 줄이 없으면 전환 후에도 옛 역할이 서명된 토큰을 계속 보내게 됩니다.
const SESSION_ISSUING_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/toggle-role'];

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

/**
 * [로그아웃 처리 보완] 깨진 세션 자동 정리.
 *
 * 회원 탈퇴처럼 sessionStorage 를 일부만 지우고 넘어가는 경로가 있어서,
 * "token/loggedInUser 는 없는데 refreshToken 이나 viewRole 만 남은" 상태가 생길 수 있었습니다.
 * 이 상태는 다음 로그인 때 엉뚱한 화면 모드로 들어가는 원인이 됩니다.
 */
function healBrokenSession() {
  const hasIdentity = !!getAccessToken() && !!sessionStorage.getItem(SESSION_KEYS.user);
  const hasLeftover =
    !!getRefreshToken() ||
    !!sessionStorage.getItem(SESSION_KEYS.expiresAt) ||
    !!sessionStorage.getItem('viewRole') ||
    !!sessionStorage.getItem(SESSION_KEYS.token) ||
    !!sessionStorage.getItem(SESSION_KEYS.user);

  if (!hasIdentity && hasLeftover) clearSession();
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

function currentFileName() {
  return (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
}

function isAuthPage() {
  const file = currentFileName();
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
    // (로그아웃 진행 중이라면 이미 이동 처리 중이므로 중복 알림을 띄우지 않습니다.)
    if (!isLoggingOut && (getAccessToken() || getLoggedInUser())) {
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

// [보완] 로그아웃 버튼이 여러 개(페이지 자체 버튼 + 자동 삽입 버튼) 잡혀도
//        서버 요청과 화면 이동이 두 번 일어나지 않도록 잠금을 둡니다.
let isLoggingOut = false;

// 공통 로그아웃 처리 (docs/naming-convention.md 함수명 규칙: logoutUser())
// [보완] 서버가 세션을 실제로 폐기하도록 refreshToken 도 같이 보냅니다.
//        서버 요청이 실패해도 사용자 입장에서는 로그아웃이 되어야 하므로 로컬 삭제는 항상 수행합니다.
async function logoutUser() {
  if (isLoggingOut) return;
  isLoggingOut = true;

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

/** 모든 기기에서 로그아웃 (현재 기기 포함) */
async function logoutAllDevices() {
  if (isLoggingOut) return { success: false, data: null, message: '이미 로그아웃 처리 중입니다.' };
  isLoggingOut = true;

  let result = { success: false, data: null, message: '' };
  try {
    result = await callApi('/auth/logout-all', { method: 'POST' });
  } catch (error) {
    console.error('전체 로그아웃 API 호출 오류:', error);
  } finally {
    clearSession();
  }
  return result;
}

/**
 * [보완] 로그아웃 후 화면 정리까지 한 번에 처리합니다.
 * 기존에는 로그아웃해도 페이지가 그대로 남아, 로그인 상태로 그려진 버튼/목록이 화면에 남았습니다.
 */
async function logoutAndGoHome() {
  await logoutUser();
  window.location.replace(getSiteRoot() + '/index.html');
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

/* ================================================================== */
/* 로그아웃 UI  [로그아웃 처리 보완 - 신규 구역]                        */
/*                                                                    */
/* 이 구역은 화면에 버튼을 "없을 때만" 만들어 붙입니다.                */
/* 기존 페이지의 로그아웃 버튼(#nav-logout-btn, #logout-btn)이 있으면   */
/* 아무것도 하지 않으므로 팀원 코드와 충돌하지 않습니다.               */
/* ================================================================== */

// 페이지가 이미 가지고 있는 로그아웃 버튼을 찾는 선택자
const EXISTING_LOGOUT_SELECTOR = '#nav-logout-btn, #logout-btn, .btn-logout, [data-logout]';

// 「세션 관리」 버튼을 붙일 화면 (계정 관련 화면에만 노출해 헤더가 복잡해지지 않게 함)
const SESSION_UI_PAGES = ['mypage.html', 'profile-edit.html'];

function injectSessionUiStyle() {
  if (document.getElementById('session-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'session-ui-style';
  style.textContent =
    '.session-logout-btn{display:inline-flex;align-items:center;padding:7px 16px;' +
    'border:1.5px solid rgba(251,246,236,.45);border-radius:999px;' +
    'background:transparent;color:var(--paper,#fbf6ec);' +
    'font-family:"Inter",sans-serif;font-size:13px;font-weight:600;line-height:1.2;' +
    'cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease;}' +
    '.session-logout-btn:hover{background:rgba(251,246,236,.14);border-color:var(--paper,#fbf6ec);}' +
    '.session-manage-btn{margin-left:8px;padding:6px 12px;border:1px solid rgba(0,0,0,.18);' +
    'border-radius:999px;background:transparent;color:inherit;font-size:12px;font-weight:600;cursor:pointer;}' +
    '.session-manage-btn:hover{background:rgba(0,0,0,.06);}' +
    '.session-modal-backdrop{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(0,0,0,.45);padding:16px;}' +
    '.session-modal{width:100%;max-width:520px;max-height:80vh;overflow:auto;background:#fff;' +
    'border-radius:14px;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.25);' +
    'font-family:"Pretendard","Inter",sans-serif;color:#2b2118;}' +
    '.session-modal h3{margin:0 0 4px;font-size:18px;}' +
    '.session-modal .session-modal-desc{margin:0 0 16px;font-size:13px;color:#6d6257;}' +
    '.session-item{border:1px solid #e6e0d7;border-radius:10px;padding:12px 14px;margin-bottom:10px;font-size:13px;}' +
    '.session-item.is-current{border-color:#e8a33d;background:rgba(232,163,61,.09);}' +
    '.session-item .session-item-title{font-weight:700;margin-bottom:4px;}' +
    '.session-item .session-item-meta{color:#6d6257;font-size:12px;line-height:1.6;}' +
    '.session-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px;}' +
    '.session-modal-actions button{padding:9px 16px;border-radius:8px;font-size:13px;' +
    'font-weight:600;cursor:pointer;border:1px solid #d8d0c5;background:#fff;color:#2b2118;}' +
    '.session-modal-actions .is-danger{border-color:#c8452c;background:#c8452c;color:#fff;}';
  document.head.appendChild(style);
}

function formatSessionDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

/** userAgent 문자열을 사람이 읽을 수 있는 짧은 이름으로 바꿉니다. */
function describeDevice(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return '알 수 없는 기기';
  const os = /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad/i.test(ua) ? 'iOS'
        : /Mac OS X/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux' : '기타 OS';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /Chrome\//i.test(ua) ? 'Chrome'
      : /Safari\//i.test(ua) ? 'Safari'
        : /Firefox\//i.test(ua) ? 'Firefox' : '기타 브라우저';
  return `${os} · ${browser}`;
}

function closeSessionModal() {
  document.getElementById('session-modal-backdrop')?.remove();
}

async function openSessionModal() {
  injectSessionUiStyle();
  closeSessionModal();

  const backdrop = document.createElement('div');
  backdrop.id = 'session-modal-backdrop';
  backdrop.className = 'session-modal-backdrop';
  backdrop.innerHTML =
    '<div class="session-modal" role="dialog" aria-modal="true" aria-label="세션 관리">' +
    '<h3>로그인 중인 기기</h3>' +
    '<p class="session-modal-desc">불러오는 중입니다…</p>' +
    '<div id="session-list"></div>' +
    '<div class="session-modal-actions">' +
    '<button type="button" id="session-close-btn">닫기</button>' +
    '<button type="button" id="session-logout-all-btn" class="is-danger">모든 기기에서 로그아웃</button>' +
    '</div></div>';
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSessionModal(); });
  backdrop.querySelector('#session-close-btn').addEventListener('click', closeSessionModal);
  backdrop.querySelector('#session-logout-all-btn').addEventListener('click', async () => {
    if (!window.confirm('현재 기기를 포함한 모든 기기에서 로그아웃됩니다. 계속할까요?')) return;
    await logoutAllDevices();
    window.location.replace(getSiteRoot() + '/pages/A_auth-main/login.html');
  });

  const result = await callApi('/auth/sessions');
  const desc = backdrop.querySelector('.session-modal-desc');
  const list = backdrop.querySelector('#session-list');
  if (!desc || !list) return;

  if (!result.success) {
    desc.textContent = result.message || '세션 목록을 불러오지 못했습니다.';
    return;
  }

  const sessions = result.data?.sessions || [];
  if (sessions.length === 0) {
    // auth_sessions 테이블이 없는(축소 모드) 환경에서는 목록이 비어 있습니다.
    desc.textContent = '표시할 세션 정보가 없습니다. (세션 테이블 미적용 환경일 수 있습니다)';
    return;
  }

  desc.textContent = `현재 ${sessions.length}개 기기에서 로그인되어 있습니다.`;
  list.innerHTML = sessions.map((s) => (
    '<div class="session-item' + (s.current ? ' is-current' : '') + '">' +
    '<div class="session-item-title">' + describeDevice(s.userAgent) + (s.current ? ' · 현재 기기' : '') + '</div>' +
    '<div class="session-item-meta">' +
    '로그인: ' + formatSessionDate(s.issuedAt) + '<br>' +
    '최근 사용: ' + formatSessionDate(s.lastUsedAt) + '<br>' +
    '만료 예정: ' + formatSessionDate(s.expiresAt) +
    '</div></div>'
  )).join('');
}

/**
 * 헤더에 로그아웃 버튼을 자동으로 붙입니다.
 * - 로그인 상태가 아니면 붙이지 않습니다.
 * - 페이지에 이미 로그아웃 버튼이 있으면 그대로 두고 아무것도 하지 않습니다.
 */
function renderLogoutUi() {
  if (isAuthPage()) return;
  if (!getLoggedInUser()) return;

  const existing = document.querySelector(EXISTING_LOGOUT_SELECTOR);
  injectSessionUiStyle();

  let anchor = existing;

  if (!existing) {
    const header = document.querySelector('header.nav') || document.querySelector('header');
    if (!header) return; // 헤더가 없는 화면은 대상이 아닙니다.

    if (!document.getElementById('session-logout-btn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'session-logout-btn';
      btn.className = 'session-logout-btn';
      btn.textContent = '로그아웃';
      btn.addEventListener('click', () => { logoutAndGoHome(); });

      const navLinks = header.querySelector('.nav-links');
      (navLinks || header).appendChild(btn);
      anchor = btn;
    } else {
      anchor = document.getElementById('session-logout-btn');
    }
  }

  // 「세션 관리」 버튼은 계정 관련 화면에만 붙입니다.
  if (anchor && SESSION_UI_PAGES.indexOf(currentFileName()) >= 0 && !document.getElementById('session-manage-btn')) {
    const manageBtn = document.createElement('button');
    manageBtn.type = 'button';
    manageBtn.id = 'session-manage-btn';
    manageBtn.className = 'session-manage-btn';
    manageBtn.textContent = '세션 관리';
    manageBtn.title = '로그인 중인 기기를 확인하고 모든 기기에서 로그아웃할 수 있습니다.';
    manageBtn.addEventListener('click', () => { openSessionModal(); });
    anchor.insertAdjacentElement('afterend', manageBtn);
  }
}

/* ------------------------------------------------------------------ */
/* 초기화                                                              */
/* ------------------------------------------------------------------ */

healBrokenSession();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderLogoutUi);
} else {
  renderLogoutUi();
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
  // [로그아웃 처리 보완]
  logoutUser,
  logoutAllDevices,
  logoutAndGoHome,
  openSessionModal,
  closeSessionModal,
  renderLogoutUi,
};


/* ==================================================================
 * [추가] 닉네임 -> 프로필 링크 공통 헬퍼 (ProfileLink)
 *
 * 원래 common/js/profile-link.js 라는 별도 파일에 두었는데,
 * 그 <script> 태그가 빠진 화면에서는 window.ProfileLink 가 undefined 라
 * 닉네임이 그냥 회색 글씨로만 나오고 클릭이 안 되는 문제가 있었습니다.
 * 목록을 그리는 화면은 어차피 전부 api.js 를 불러오므로, 여기로 옮겨서
 * "데이터를 불러올 수 있는 화면이면 링크도 반드시 동작"하게 만듭니다.
 *
 * <a> 가 아니라 <span> 을 쓰는 이유
 *   메인 화면의 마켓 카드는 카드 전체가 이미 <a> 로 감싸여 있습니다.
 *   그 안에 <a> 를 또 넣으면 잘못된 HTML 이라 브라우저가 태그를 끊어버립니다.
 *   그래서 링크처럼 보이는 <span data-profile-user-id> 를 쓰고,
 *   document 에 붙인 클릭 핸들러가 대신 이동시킵니다.
 * ================================================================== */
(function () {
  'use strict';
  if (window.ProfileLink) return; // 이미 정의돼 있으면 건드리지 않습니다.

  // [수정] 이 프로젝트의 화면 이동 링크는 전부 확장자 없이 씁니다.
  //          예) market-detail?marketId=8461, booth-apply?marketId=..., payment?applicationId=...
  //        개발 서버가 'X.html?q=1' 요청을 'X' 로 리다이렉트하면서 쿼리스트링을 떨어뜨리기 때문에,
  //        user-profile.html?userId=5 로 보내면 userId 가 사라진 채 도착합니다.
  //        (프로필 화면에서 "주소에 사용자 번호가 없어요" 가 뜨던 원인)
  //        지금 보고 있는 주소가 .html 을 쓰고 있으면 .html 을, 아니면 확장자 없는 주소를 씁니다.
  var PROFILE_PAGE_CLEAN = '/pages/A_auth-main/user-profile';
  var PROFILE_PAGE_HTML = '/pages/A_auth-main/user-profile.html';

  function profilePagePath() {
    return /\.html$/i.test(window.location.pathname) ? PROFILE_PAGE_HTML : PROFILE_PAGE_CLEAN;
  }

  // 프론트 루트를 역산합니다. (Live Server 루트가 하위 폴더인 경우도 있어 고정 경로 사용 불가)
  function getSiteRoot() {
    var p = window.location.pathname;
    var idx = p.toLowerCase().indexOf('/pages/');
    if (idx >= 0) return p.slice(0, idx);
    return p.replace(/\/[^/]*$/, '');
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function profileUrl(userId) {
    return getSiteRoot() + profilePagePath() + '?userId=' + encodeURIComponent(userId);
  }

  /** 닉네임 링크 HTML. userId 가 없으면 링크 없이 텍스트만 돌려줍니다. */
  function profileLinkHtml(userId, nickname, options) {
    var opts = options || {};
    var label = nickname || opts.fallback || (userId ? '#' + userId : '알 수 없음');
    if (!userId) return escapeHtml(label);

    return (
      '<span class="profile-link" role="link" tabindex="0" ' +
      'data-profile-user-id="' + escapeHtml(userId) + '" ' +
      'title="' + escapeHtml(label) + '님의 프로필 보기">' +
      escapeHtml(label) +
      '</span>'
    );
  }

  /** 「프로필 보기」 버튼 HTML. 닉네임 클릭이 눈에 안 띌 때 함께 씁니다. */
  function profileButtonHtml(userId, text) {
    if (!userId) return '';
    return (
      '<button type="button" class="btn btn-outline btn-sm" ' +
      'data-profile-user-id="' + escapeHtml(userId) + '">' +
      escapeHtml(text || '프로필 보기') +
      '</button>'
    );
  }

  function go(userId) {
    if (!userId) return;
    window.location.href = profileUrl(userId);
  }

  function findTarget(node) {
    return node && node.closest ? node.closest('[data-profile-user-id]') : null;
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var el = findTarget(e.target);
      if (!el) return;
      e.preventDefault();   // 카드 전체 <a> 의 기본 이동을 막습니다.
      e.stopPropagation();
      go(el.getAttribute('data-profile-user-id'));
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = findTarget(e.target);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      go(el.getAttribute('data-profile-user-id'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.ProfileLink = {
    url: profileUrl,
    html: profileLinkHtml,
    button: profileButtonHtml,
    escapeHtml: escapeHtml,
  };
})();
