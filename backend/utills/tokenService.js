// backend/utills/tokenService.js
// [세션/토큰 발급 보완 - 신규 파일]
//
// ★ .env 를 고치지 않아도 그대로 동작합니다. (환경변수는 전부 선택 사항)
// ★ DB 마이그레이션을 못 돌려도 기존 동작(액세스 토큰 7일)으로 자동 복귀합니다.
//
// 기존 문제
//   1) JWT_SECRET 기본값이 authRoutes.js / authMiddleware.js / roleGuard.js 3곳에 각각 하드코딩되어 있었습니다.
//      -> 시크릿을 바꿀 때 한 곳이라도 빠지면 "로그인은 되는데 API는 401" 같은 버그가 납니다.
//   2) 액세스 토큰 하나(7일)만 발급해서, 만료되면 무조건 다시 로그인해야 했습니다.
//   3) 로그아웃해도 서버는 토큰을 무효화하지 않아, 남은 7일 동안 그 토큰이 계속 통했습니다.
//
// 이 모듈이 하는 일
//   - 액세스 토큰(짧게) + 리프레시 토큰(길게) 2종 발급
//   - 리프레시 토큰은 원문을 저장하지 않고 SHA-256 해시만 auth_sessions 테이블에 보관
//   - 세션 폐기(로그아웃 / 전체 로그아웃 / 비밀번호 변경 / 회원 탈퇴) 지원
//
// [로그아웃 처리 보완] 이번 변경분
//   1) deleteUserSessions(userId) 추가
//      -> 회원 탈퇴 시 세션 행을 실제로 지웁니다. (revoke 는 "폐기 표시"라 행이 남습니다)
//   2) 만료 세션 자동 정리
//      -> cleanupExpiredSessions() 를 server.js 에서 호출하지 않고 있어서 죽은 세션이 계속 쌓였습니다.
//         테이블 준비가 끝나는 시점(서버 기동 후 첫 로그인/인증)에 1회만 백그라운드로 정리합니다.
//         server.js 를 건드리지 않아도 되도록 이 파일 안에서 처리합니다.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
// [JWT activeRole] 역할 정규화 규칙을 authRoutes 와 공유합니다.
import { normalizeActiveRole } from './rolePolicy.js';

/* ------------------------------------------------------------------ */
/* 설정 - 전부 "없으면 기본값" 이라 .env 수정이 필요 없습니다          */
/* ------------------------------------------------------------------ */

export const JWT_SECRET = process.env.JWT_SECRET || 'flea-market-dev-secret-change-me';

// 액세스 토큰 수명을 .env 에서 지정했다면 그 값을 그대로 씁니다. (지정 안 하면 아래 자동 규칙)
const CONFIGURED_ACCESS_TTL = process.env.JWT_ACCESS_EXPIRES || null;

// [중요] 자동 규칙
//   세션 테이블 있음 -> '2h'  (짧게 두고 리프레시 토큰으로 자동 갱신)
//   세션 테이블 없음 -> '7d'  (갱신 수단이 없으므로 기존과 똑같이 7일 유지)
// 이렇게 해야 마이그레이션을 못 돌린 환경에서 "2시간마다 로그아웃되는" 사고가 안 납니다.
const ACCESS_TTL_WITH_REFRESH = '2h';
const ACCESS_TTL_WITHOUT_REFRESH = '7d';

// 표시용 (GET /auth/sessions 응답 등)
export const ACCESS_TOKEN_TTL = CONFIGURED_ACCESS_TTL || 'auto (2h / 세션테이블 없으면 7d)';

// 리프레시 토큰 수명(일)
export const REFRESH_TOKEN_TTL_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 14);

// 세션 테이블이 없을 때 자동으로 만들어 볼지 여부 (권한이 없으면 조용히 포기하고 축소 동작)
const AUTO_CREATE_SESSION_TABLE = String(process.env.AUTH_SESSION_AUTO_CREATE || 'true') !== 'false';

// 만료된 세션을 며칠 지난 뒤 삭제할지
const SESSION_RETENTION_DAYS = Number(process.env.AUTH_SESSION_RETENTION_DAYS || 30);

const SESSION_TABLE = 'auth_sessions';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('[tokenService] 운영 환경에서는 JWT_SECRET 환경변수를 반드시 설정해야 합니다.');
}

/* ------------------------------------------------------------------ */
/* 유틸                                                                */
/* ------------------------------------------------------------------ */

/** '30s' | '15m' | '2h' | '7d' -> 초 단위 숫자 */
export function ttlToSeconds(ttl) {
  if (typeof ttl === 'number') return ttl;
  const m = String(ttl).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return 7200;
  const n = Number(m[1]);
  const unit = (m[2] || 's').toLowerCase();
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}

/** 지금 상황에 맞는 액세스 토큰 수명을 정합니다. */
function resolveAccessTtl(refreshAvailable) {
  if (CONFIGURED_ACCESS_TTL) return CONFIGURED_ACCESS_TTL;
  return refreshAvailable ? ACCESS_TTL_WITH_REFRESH : ACCESS_TTL_WITHOUT_REFRESH;
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function newSessionId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
}

function newRefreshToken() {
  // 48바이트 난수 = 추측 불가. JWT가 아니라 "불투명 토큰"이라 내용이 새어나갈 게 없습니다.
  return crypto.randomBytes(48).toString('hex');
}

/* ------------------------------------------------------------------ */
/* auth_sessions 테이블 준비 (1회만 검사 후 캐시)                      */
/* ------------------------------------------------------------------ */

let sessionTableReady = null;
let readyPromise = null;
let cleanupDone = false; // [보완] 만료 세션 정리는 프로세스당 1회만

async function tableExists() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [SESSION_TABLE]
  );
  return rows[0].cnt > 0;
}

async function tryCreateTable() {
  // users.userId 타입이 팀 DB마다 다를 수 있어 실제 타입을 읽어옵니다.
  let userIdType = 'BIGINT UNSIGNED';
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_TYPE AS colType FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'userId'`
    );
    if (rows.length > 0) userIdType = rows[0].colType;
  } catch (error) {
    /* 타입 조회 실패 시 기본값 사용 */
  }

  // 자동 생성에서는 외래키를 걸지 않습니다. (타입/권한 문제로 실패할 여지를 줄임)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SESSION_TABLE} (
      sessionId        VARCHAR(36)   NOT NULL,
      userId           ${userIdType} NOT NULL,
      refreshTokenHash CHAR(64)      NOT NULL,
      userAgent        VARCHAR(255)  DEFAULT NULL,
      ipAddress        VARCHAR(45)   DEFAULT NULL,
      issuedAt         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lastUsedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt        DATETIME      NOT NULL,
      revokedAt        DATETIME      DEFAULT NULL,
      PRIMARY KEY (sessionId),
      UNIQUE KEY uk_auth_sessions_refresh (refreshTokenHash),
      KEY idx_auth_sessions_user (userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/**
 * [보완] 만료 세션 정리를 백그라운드로 1회만 실행합니다.
 * await 하지 않기 때문에 로그인 응답이 느려지지 않고, 실패해도 서비스에 영향이 없습니다.
 */
function scheduleCleanupOnce() {
  if (cleanupDone) return;
  cleanupDone = true;
  setTimeout(() => {
    cleanupExpiredSessions()
      .then((count) => {
        if (count > 0) console.log(`🧹 만료 세션 ${count}건을 정리했습니다.`);
      })
      .catch((error) => console.warn('[tokenService] 만료 세션 정리 실패:', error.message));
  }, 0);
}

export async function isSessionStoreReady() {
  if (sessionTableReady !== null) {
    if (sessionTableReady) scheduleCleanupOnce();
    return sessionTableReady;
  }
  if (readyPromise) return readyPromise; // 동시 요청이 몰려도 검사는 한 번만

  readyPromise = (async () => {
    try {
      if (await tableExists()) {
        sessionTableReady = true;
      } else if (AUTO_CREATE_SESSION_TABLE) {
        // 마이그레이션 스크립트를 못 돌리는 환경을 위해 서버가 알아서 만들어 봅니다.
        // CREATE 권한이 없으면 예외가 나고, 그때는 축소 모드로 계속 갑니다.
        await tryCreateTable();
        sessionTableReady = await tableExists();
        if (sessionTableReady) console.log(`✅ ${SESSION_TABLE} 테이블을 자동 생성했습니다.`);
      } else {
        sessionTableReady = false;
      }
    } catch (error) {
      console.warn(`⚠️  [tokenService] ${SESSION_TABLE} 준비 실패: ${error.message}`);
      sessionTableReady = false;
    }

    if (!sessionTableReady) {
      console.warn(
        `⚠️  [tokenService] ${SESSION_TABLE} 테이블이 없어 리프레시 토큰 / 로그아웃 무효화가 꺼집니다.\n` +
        `    -> 액세스 토큰 ${ACCESS_TTL_WITHOUT_REFRESH} 발급(기존과 동일)으로 동작합니다.\n` +
        '    켜려면: cd backend && node scripts/migrate-add-auth-sessions.js'
      );
    } else {
      // [보완] 테이블이 준비된 첫 시점에 죽은 세션을 한 번 청소합니다.
      scheduleCleanupOnce();
    }

    readyPromise = null;
    return sessionTableReady;
  })();

  return readyPromise;
}

/* ------------------------------------------------------------------ */
/* users.activeRole 컬럼 존재 여부 (1회 검사 후 캐시)                  */
/* ------------------------------------------------------------------ */

// 팀 DB 마다 마이그레이션 적용 시점이 달라서, 컬럼이 없어도 서비스가 죽지 않아야 합니다.
// 컬럼이 없으면 activeRole 은 계정 종류(userType)로만 결정됩니다.
let activeRoleColumnReady = null;
let activeRoleCheckedAt = 0;

// "컬럼 없음"은 영구 캐시하지 않습니다.
// 마이그레이션을 돌린 뒤 서버를 재시작하지 않아도 1분 안에 자동으로 인식하게 하기 위함입니다.
const ACTIVE_ROLE_RECHECK_MS = 60 * 1000;

export async function hasActiveRoleColumn() {
  if (activeRoleColumnReady === true) return true;
  if (activeRoleColumnReady === false && Date.now() - activeRoleCheckedAt < ACTIVE_ROLE_RECHECK_MS) {
    return false;
  }
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'activeRole'`
    );
    activeRoleColumnReady = rows[0].cnt > 0;
    activeRoleCheckedAt = Date.now();
    if (!activeRoleColumnReady) {
      console.warn(
        '⚠️  [tokenService] users.activeRole 컬럼이 없어 역할 전환이 저장되지 않습니다.\n' +
        '    켜려면: cd backend && node scripts/migrate-add-active-role.js'
      );
    }
  } catch (error) {
    activeRoleColumnReady = false;
    activeRoleCheckedAt = Date.now();
  }
  return activeRoleColumnReady;
}

/* ------------------------------------------------------------------ */
/* 액세스 토큰                                                         */
/* ------------------------------------------------------------------ */

/**
 * 액세스 토큰 발급.
 * payload 에 sid(세션 ID)를 넣어 두면, 로그아웃된 세션의 토큰을 서버가 즉시 거부할 수 있습니다.
 */
export function signAccessToken({ userId, userType, activeRole = null, sid = null, ttl = null }) {
  const payload = {
    userId,
    userType: Number(userType),
    // [JWT activeRole] 화면 모드를 토큰에 함께 서명해서, 서버가 클라이언트가 보낸 값을 믿지 않아도 되게 합니다.
    activeRole: normalizeActiveRole(userType, activeRole),
    typ: 'access',
  };
  if (sid) payload.sid = sid;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttl || resolveAccessTtl(!!sid) });
}

/**
 * [JWT activeRole - 신규] 세션은 그대로 두고 액세스 토큰만 다시 발급합니다.
 *
 * 역할 전환(PATCH /auth/toggle-role)에서 사용합니다.
 * activeRole 이 토큰에 들어가는 순간 토큰은 "그 시점의 스냅샷"이 되기 때문에,
 * DB 만 UPDATE 하고 토큰을 두면 만료(기본 2h) 전까지 서버는 계속 옛 역할로 인식합니다.
 * 리프레시 토큰과 세션(sid)은 유지되므로 다른 기기의 로그인 상태에는 영향이 없습니다.
 */
export function reissueAccessToken({ userId, userType, activeRole = null, sid = null }) {
  const ttl = resolveAccessTtl(!!sid);
  const ttlSec = ttlToSeconds(ttl);
  return {
    token: signAccessToken({ userId, userType, activeRole, sid, ttl }),
    refreshToken: null, // 기존 리프레시 토큰을 그대로 사용합니다. (프론트는 null 이면 덮어쓰지 않음)
    sessionId: sid,
    expiresIn: ttlSec,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    refreshExpiresAt: null,
    activeRole: normalizeActiveRole(userType, activeRole),
  };
}

/**
 * 액세스 토큰 검증.
 * @returns {{ ok: boolean, payload?: object, code?: 'TOKEN_EXPIRED'|'TOKEN_INVALID' }}
 * 기존에는 만료와 위조를 구분하지 않아서 프론트가 "재발급을 시도할지 / 로그인 화면으로 보낼지"를
 * 판단할 수 없었습니다. code 로 구분해서 내려줍니다.
 */
export function verifyAccessToken(token) {
  try {
    return { ok: true, payload: jwt.verify(token, JWT_SECRET) };
  } catch (error) {
    return {
      ok: false,
      code: error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    };
  }
}

/** Authorization: Bearer xxx 헤더에서 토큰만 뽑아냅니다. */
export function extractBearerToken(req) {
  const header = req.headers['authorization'] || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/* ------------------------------------------------------------------ */
/* 세션(리프레시 토큰) 관리                                            */
/* ------------------------------------------------------------------ */

/**
 * 로그인/회원가입 시 새 세션을 만들고 액세스 + 리프레시 토큰을 함께 발급합니다.
 * 테이블이 없으면 리프레시 토큰 없이 "7일짜리 액세스 토큰"만 돌려줍니다. (기존 동작과 동일)
 */
export async function issueSession({ userId, userType, activeRole = null, req = null }) {
  const ready = await isSessionStoreReady();

  if (!ready) {
    const ttl = resolveAccessTtl(false);
    const ttlSec = ttlToSeconds(ttl);
    return {
      token: signAccessToken({ userId, userType, activeRole, ttl }),
      refreshToken: null,
      sessionId: null,
      expiresIn: ttlSec,
      expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
      refreshExpiresAt: null,
      activeRole: normalizeActiveRole(userType, activeRole),
      degraded: true,
    };
  }

  const sid = newSessionId();
  const refreshToken = newRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400 * 1000);

  try {
    await pool.query(
      `INSERT INTO ${SESSION_TABLE}
         (sessionId, userId, refreshTokenHash, userAgent, ipAddress, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        sid,
        userId,
        sha256(refreshToken),
        req ? String(req.headers['user-agent'] || '').slice(0, 255) : null,
        req ? String(req.ip || req.socket?.remoteAddress || '').slice(0, 45) : null,
        refreshExpiresAt,
      ]
    );
  } catch (error) {
    // 세션 저장에 실패해도 로그인 자체는 성공시켜야 하므로 축소 모드로 발급합니다.
    console.error('[tokenService] 세션 저장 실패(축소 모드로 발급):', error.message);
    const ttl = resolveAccessTtl(false);
    const ttlSec = ttlToSeconds(ttl);
    return {
      token: signAccessToken({ userId, userType, activeRole, ttl }),
      refreshToken: null,
      sessionId: null,
      expiresIn: ttlSec,
      expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
      refreshExpiresAt: null,
      activeRole: normalizeActiveRole(userType, activeRole),
      degraded: true,
    };
  }

  const ttl = resolveAccessTtl(true);
  const ttlSec = ttlToSeconds(ttl);

  return {
    token: signAccessToken({ userId, userType, activeRole, sid, ttl }),
    refreshToken,
    sessionId: sid,
    expiresIn: ttlSec,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    activeRole: normalizeActiveRole(userType, activeRole),
    degraded: false,
  };
}

/**
 * 리프레시 토큰으로 액세스 토큰을 재발급합니다.
 * 보안을 위해 리프레시 토큰도 매번 새 값으로 교체(rotation)합니다.
 */
export async function refreshSession(refreshToken, req = null) {
  if (!refreshToken) return { ok: false, code: 'REFRESH_REQUIRED' };
  if (!(await isSessionStoreReady())) return { ok: false, code: 'REFRESH_UNAVAILABLE' };

  // [JWT activeRole] DB 의 activeRole 을 함께 읽어 재발급 토큰에도 역할을 유지시킵니다.
  //                   (다른 탭/기기에서 역할을 바꿔도 재발급 시점에 자동으로 동기화됩니다.)
  const roleColumn = (await hasActiveRoleColumn()) ? ', u.activeRole' : '';

  const [rows] = await pool.query(
    `SELECT s.sessionId, s.userId, s.expiresAt, s.revokedAt, u.userType${roleColumn}
       FROM ${SESSION_TABLE} s
       JOIN users u ON u.userId = s.userId
      WHERE s.refreshTokenHash = ?
      LIMIT 1`,
    [sha256(refreshToken)]
  );

  if (rows.length === 0) return { ok: false, code: 'REFRESH_INVALID' };

  const session = rows[0];
  if (session.revokedAt) return { ok: false, code: 'SESSION_REVOKED' };
  if (new Date(session.expiresAt).getTime() < Date.now()) return { ok: false, code: 'REFRESH_EXPIRED' };

  const nextRefreshToken = newRefreshToken();
  const nextRefreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400 * 1000);

  await pool.query(
    `UPDATE ${SESSION_TABLE}
        SET refreshTokenHash = ?, expiresAt = ?, lastUsedAt = CURRENT_TIMESTAMP, userAgent = COALESCE(?, userAgent)
      WHERE sessionId = ?`,
    [
      sha256(nextRefreshToken),
      nextRefreshExpiresAt,
      req ? String(req.headers['user-agent'] || '').slice(0, 255) : null,
      session.sessionId,
    ]
  );

  const ttl = resolveAccessTtl(true);
  const ttlSec = ttlToSeconds(ttl);
  const activeRole = normalizeActiveRole(session.userType, session.activeRole);

  return {
    ok: true,
    userId: session.userId,
    userType: session.userType,
    activeRole,
    sessionId: session.sessionId,
    token: signAccessToken({
      userId: session.userId,
      userType: session.userType,
      activeRole,
      sid: session.sessionId,
      ttl,
    }),
    refreshToken: nextRefreshToken,
    expiresIn: ttlSec,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    refreshExpiresAt: nextRefreshExpiresAt.toISOString(),
  };
}

/** 해당 세션이 아직 살아 있는지 확인 (액세스 토큰 검증 시 사용) */
export async function isSessionActive(sid) {
  if (!sid) return true; // sid 가 없는 구버전 토큰은 통과시켜 하위 호환을 유지합니다.
  if (!(await isSessionStoreReady())) return true;

  const [rows] = await pool.query(
    `SELECT revokedAt, expiresAt FROM ${SESSION_TABLE} WHERE sessionId = ? LIMIT 1`,
    [sid]
  );
  if (rows.length === 0) return false;
  if (rows[0].revokedAt) return false;
  return new Date(rows[0].expiresAt).getTime() >= Date.now();
}

/** 로그아웃: 세션 1건 폐기 */
export async function revokeSession(sid) {
  if (!sid || !(await isSessionStoreReady())) return false;
  const [result] = await pool.query(
    `UPDATE ${SESSION_TABLE} SET revokedAt = CURRENT_TIMESTAMP WHERE sessionId = ? AND revokedAt IS NULL`,
    [sid]
  );
  return result.affectedRows > 0;
}

/** 리프레시 토큰 값으로 세션 폐기 (액세스 토큰이 이미 만료된 상태의 로그아웃용) */
export async function revokeSessionByRefreshToken(refreshToken) {
  if (!refreshToken || !(await isSessionStoreReady())) return false;
  const [result] = await pool.query(
    `UPDATE ${SESSION_TABLE} SET revokedAt = CURRENT_TIMESTAMP WHERE refreshTokenHash = ? AND revokedAt IS NULL`,
    [sha256(refreshToken)]
  );
  return result.affectedRows > 0;
}

/**
 * 전체 로그아웃 (비밀번호 변경 / 다른 기기 로그아웃).
 * @param exceptSid 이 세션만 남기고 나머지를 폐기하고 싶을 때 사용
 */
export async function revokeAllSessions(userId, exceptSid = null) {
  if (!(await isSessionStoreReady())) return 0;
  const sql = exceptSid
    ? `UPDATE ${SESSION_TABLE} SET revokedAt = CURRENT_TIMESTAMP WHERE userId = ? AND revokedAt IS NULL AND sessionId <> ?`
    : `UPDATE ${SESSION_TABLE} SET revokedAt = CURRENT_TIMESTAMP WHERE userId = ? AND revokedAt IS NULL`;
  const params = exceptSid ? [userId, exceptSid] : [userId];
  const [result] = await pool.query(sql, params);
  return result.affectedRows;
}

/**
 * [신규] 회원 탈퇴용 - 해당 사용자의 세션 행을 실제로 삭제합니다.
 *
 * revokeAllSessions 는 "폐기 표시"라서 행이 남습니다.
 * 탈퇴한 계정은 users 행이 사라지므로 세션만 고아로 남게 되고,
 * userId 가 재사용되는 스키마라면 남은 행이 오작동의 원인이 될 수 있어 삭제로 처리합니다.
 *
 * @returns {Promise<number>} 삭제된 세션 수 (테이블이 없으면 0)
 */
export async function deleteUserSessions(userId) {
  if (!(await isSessionStoreReady())) return 0;
  const [result] = await pool.query(
    `DELETE FROM ${SESSION_TABLE} WHERE userId = ?`,
    [userId]
  );
  return result.affectedRows;
}

/** 현재 로그인 중인 기기(세션) 목록 */
export async function listActiveSessions(userId) {
  if (!(await isSessionStoreReady())) return [];
  const [rows] = await pool.query(
    `SELECT sessionId, userAgent, ipAddress, issuedAt, lastUsedAt, expiresAt
       FROM ${SESSION_TABLE}
      WHERE userId = ? AND revokedAt IS NULL AND expiresAt > NOW()
      ORDER BY lastUsedAt DESC`,
    [userId]
  );
  return rows;
}

/** 만료된 세션 정리 (테이블 준비 직후 자동 1회 호출 / 수동 호출도 가능) */
export async function cleanupExpiredSessions() {
  if (sessionTableReady !== true) return 0;
  const [result] = await pool.query(
    `DELETE FROM ${SESSION_TABLE} WHERE expiresAt < NOW() - INTERVAL ? DAY`,
    [SESSION_RETENTION_DAYS]
  );
  return result.affectedRows;
}

export default {
  JWT_SECRET,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  ttlToSeconds,
  signAccessToken,
  reissueAccessToken,
  verifyAccessToken,
  extractBearerToken,
  issueSession,
  refreshSession,
  isSessionActive,
  revokeSession,
  revokeSessionByRefreshToken,
  revokeAllSessions,
  deleteUserSessions,
  listActiveSessions,
  cleanupExpiredSessions,
  isSessionStoreReady,
  hasActiveRoleColumn,
};
