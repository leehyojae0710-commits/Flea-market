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
//   - 세션 폐기(로그아웃 / 전체 로그아웃 / 비밀번호 변경) 지원

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

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

export async function isSessionStoreReady() {
  if (sessionTableReady !== null) return sessionTableReady;
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
    }

    readyPromise = null;
    return sessionTableReady;
  })();

  return readyPromise;
}

/* ------------------------------------------------------------------ */
/* 액세스 토큰                                                         */
/* ------------------------------------------------------------------ */

/**
 * 액세스 토큰 발급.
 * payload 에 sid(세션 ID)를 넣어 두면, 로그아웃된 세션의 토큰을 서버가 즉시 거부할 수 있습니다.
 */
export function signAccessToken({ userId, userType, sid = null, ttl = null }) {
  const payload = { userId, userType: Number(userType), typ: 'access' };
  if (sid) payload.sid = sid;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttl || resolveAccessTtl(!!sid) });
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
export async function issueSession({ userId, userType, req = null }) {
  const ready = await isSessionStoreReady();

  if (!ready) {
    const ttl = resolveAccessTtl(false);
    const ttlSec = ttlToSeconds(ttl);
    return {
      token: signAccessToken({ userId, userType, ttl }),
      refreshToken: null,
      sessionId: null,
      expiresIn: ttlSec,
      expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
      refreshExpiresAt: null,
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
      token: signAccessToken({ userId, userType, ttl }),
      refreshToken: null,
      sessionId: null,
      expiresIn: ttlSec,
      expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
      refreshExpiresAt: null,
      degraded: true,
    };
  }

  const ttl = resolveAccessTtl(true);
  const ttlSec = ttlToSeconds(ttl);

  return {
    token: signAccessToken({ userId, userType, sid, ttl }),
    refreshToken,
    sessionId: sid,
    expiresIn: ttlSec,
    expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
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

  const [rows] = await pool.query(
    `SELECT s.sessionId, s.userId, s.expiresAt, s.revokedAt, u.userType
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

  return {
    ok: true,
    userId: session.userId,
    userType: session.userType,
    sessionId: session.sessionId,
    token: signAccessToken({ userId: session.userId, userType: session.userType, sid: session.sessionId, ttl }),
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
 * 전체 로그아웃 (비밀번호 변경 / 회원 탈퇴 / 다른 기기 로그아웃).
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

/** 만료된 세션 정리 (서버 기동 시 1회 호출용) */
export async function cleanupExpiredSessions() {
  if (!(await isSessionStoreReady())) return 0;
  const [result] = await pool.query(
    `DELETE FROM ${SESSION_TABLE} WHERE expiresAt < NOW() - INTERVAL 30 DAY`
  );
  return result.affectedRows;
}

export default {
  JWT_SECRET,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  ttlToSeconds,
  signAccessToken,
  verifyAccessToken,
  extractBearerToken,
  issueSession,
  refreshSession,
  isSessionActive,
  revokeSession,
  revokeSessionByRefreshToken,
  revokeAllSessions,
  listActiveSessions,
  cleanupExpiredSessions,
  isSessionStoreReady,
};
