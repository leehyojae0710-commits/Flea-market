// backend/routes/authRoutes.js
//
// [세션/토큰 발급 보완] 변경 요약
//   기존: 로그인/회원가입 시 7일짜리 액세스 토큰 1개만 발급. 로그아웃은 형식적(서버 무효화 없음).
//         만료 시 재발급 수단이 없고, 프론트가 세션을 확인할 API도 없었음.
//   보완:
//     1) 액세스 토큰(기본 2h) + 리프레시 토큰(기본 14일) 2종 발급, 응답에 expiresIn/expiresAt 포함
//     2) POST /auth/refresh   - 리프레시 토큰으로 재발급 (리프레시 토큰도 매번 교체)
//     3) GET  /auth/me        - 현재 세션 확인 + 최신 회원정보 재동기화
//     4) POST /auth/logout    - 서버측 세션 실제 폐기 (토큰 즉시 무효)
//     5) POST /auth/logout-all- 모든 기기 로그아웃
//     6) GET  /auth/sessions  - 로그인 중인 기기 목록
//     7) JWT_SECRET 하드코딩 제거 -> utills/tokenService.js 로 일원화
//
// 회원가입/로그인/닉네임 중복확인/역할전환의 기존 동작과 응답 필드는 그대로 유지했습니다.
// (기존 필드에 refreshToken, expiresIn, expiresAt 가 "추가"만 된 형태라 기존 프론트도 그대로 동작합니다.)

import express from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { isHostType, USER_TYPE } from '../middleware/roleGuard.js';
import { validateRegisterInput } from '../middleware/registerValidationMiddleware.js';
// [닉네임] 형식/예약어/중복 규칙은 utills/nicknamePolicy.js 한 곳에서 관리합니다.
import {
  validateNickname,
  isNicknameTaken,
  isDuplicateKeyError,
} from '../utills/nicknamePolicy.js';
// [세션/토큰] 발급·검증·폐기는 utills/tokenService.js 한 곳에서 관리합니다.
import {
  issueSession,
  refreshSession,
  revokeSession,
  revokeSessionByRefreshToken,
  revokeAllSessions,
  listActiveSessions,
  verifyAccessToken,
  extractBearerToken,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
} from '../utills/tokenService.js';

const router = express.Router();
const SALT_ROUNDS = 10;

function publicUser(row) {
  // 비밀번호 해시는 프론트로 내려주지 않음.
  // userId는 화면에 노출하지 않는 내부 식별자지만, 마켓 등록 등 다른 API 호출에 필요해서 데이터에는 포함함.
  return {
    userId: row.userId,
    userType: row.userType,
    email: row.email,
    phone: row.phone,
    region: row.region,
    nickname: row.nickname,
    // [C-01] 화면 분기용 정보
    activeRole: normalizeActiveRole(row.userType, row.activeRole),
    canBeHost: isHostType(row.userType), // 주최자만 true (판매자 -> 주최자 전환 불가)
  };
}

/**
 * [C-01] activeRole 정규화
 * - 주최자(userType 1)는 host / seller 를 모두 쓸 수 있습니다. (주최자 -> 판매자 겸용 허용)
 * - 판매자(userType 0)는 DB에 어떤 값이 들어 있어도 항상 seller 로 고정합니다.
 */
function normalizeActiveRole(userType, activeRole) {
  if (!isHostType(userType)) return 'seller';
  return activeRole === 'seller' ? 'seller' : 'host';
}

/**
 * [C-01] 로그인 직후 첫 화면 경로
 * [변경] 주최자/판매자 모두 메인 페이지로 진입합니다.
 *        (주최자의 내 마켓 관리 화면은 헤더 메뉴 / 모드 전환으로 이동)
 */
function landingPathFor() {
  return '/index.html';
}

/**
 * [세션/토큰 발급] 인증 성공 응답을 한 곳에서 만듭니다.
 * 로그인 / 회원가입 / 재발급이 모두 같은 형태의 data 를 내려주도록 통일했습니다.
 */
function authPayload(session, user) {
  return {
    token: session.token,                       // 액세스 토큰
    refreshToken: session.refreshToken,         // 재발급용 (auth_sessions 미생성 시 null)
    tokenType: 'Bearer',
    expiresIn: session.expiresIn,               // 초 단위 남은 시간
    expiresAt: session.expiresAt,               // ISO 문자열 (프론트 사전 갱신용)
    refreshExpiresAt: session.refreshExpiresAt,
    sessionId: session.sessionId,
    user: user ? publicUser(user) : undefined,
    landingPath: landingPathFor(),
  };
}

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: 회원가입 / 로그인 / 세션·토큰 발급 / 역할 전환
 *
 * components:
 *   schemas:
 *     AuthSessionData:
 *       type: object
 *       properties:
 *         token: { type: string, description: "액세스 토큰 (기본 2시간)" }
 *         refreshToken: { type: string, nullable: true, description: "재발급용 토큰 (기본 14일). auth_sessions 테이블이 없으면 null" }
 *         tokenType: { type: string, example: "Bearer" }
 *         expiresIn: { type: integer, example: 7200, description: "액세스 토큰 남은 초" }
 *         expiresAt: { type: string, format: date-time }
 *         refreshExpiresAt: { type: string, format: date-time, nullable: true }
 *         sessionId: { type: string, nullable: true }
 *         user: { $ref: '#/components/schemas/User' }
 *         landingPath: { type: string, example: "/index.html" }
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 회원가입
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userType, email, password, phone, region, nickname]
 *             properties:
 *               userType: { type: integer, description: "0: 판매자, 1: 주최자", example: 0 }
 *               nickname: { type: string, description: "한글/영문/숫자 2~12자, 중복 불가", example: "바람개비" }
 *               email: { type: string, example: "seller01@example.com" }
 *               password: { type: string, example: "password123!" }
 *               phone: { type: string, example: "010-1234-5678" }
 *               region: { type: string, example: "서울시 강남구" }
 *     responses:
 *       201:
 *         description: 회원가입 성공 (세션/토큰 발급)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthSessionData' }
 *       400:
 *         description: 필수 항목 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: 이미 가입된 이메일 / 닉네임
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
// 1. 회원가입 API
router.post('/register', validateRegisterInput, async (req, res) => {
  // 존재 여부 + 형식(정규식) 검증은 validateRegisterInput 미들웨어에서 끝났으므로,
  // 여기서는 DB 중복 체크 등 비즈니스 로직만 처리합니다.
  const { userType, email, password, phone, region } = req.body;
  const userTypeNum = Number(userType);

  // [닉네임] 앞뒤 공백 제거 + 형식/예약어 검증 후의 값을 저장합니다.
  const nicknameCheck = validateNickname(req.body.nickname);
  if (!nicknameCheck.ok) {
    return res.status(400).json({ success: false, data: null, message: nicknameCheck.message });
  }
  const nickname = nicknameCheck.nickname;

  try {
    const [existing] = await pool.query('SELECT email FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: '이미 가입된 이메일입니다.' });
    }

    if (await isNicknameTaken(pool, nickname)) {
      return res.status(409).json({ success: false, message: '이미 사용 중인 닉네임입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await pool.query(
      // activeRole 은 users 테이블에 없을 수도 있는 선택 컬럼이라 INSERT 대상에서 제외합니다.
      `INSERT INTO users (userType, password, phone, email, region, nickname)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userTypeNum, hashedPassword, phone, email, region, nickname]
    );

    const userId = result.insertId;

    // [세션/토큰 발급] 가입 즉시 세션을 만들고 액세스 + 리프레시 토큰을 함께 내려줍니다.
    const session = await issueSession({ userId, userType: userTypeNum, req });

    return res.status(201).json({
      success: true,
      data: authPayload(session, {
        userId,
        userType: userTypeNum,
        email,
        phone,
        region,
        nickname,
        activeRole: null,
      }),
      message: '회원가입이 완료되었습니다.',
    });
  } catch (error) {
    // [닉네임] 동시 가입 요청은 users.nickname UNIQUE 인덱스가 최종 방어선이며, 그 오류를 409로 바꿔 내려줍니다.
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ success: false, message: '이미 사용 중인 닉네임입니다.' });
    }
    console.error('회원가입 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류로 회원가입에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/check-nickname:
 *   get:
 *     summary: 닉네임 중복 확인
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: nickname
 *         required: true
 *         schema: { type: string }
 *         description: 한글/영문/숫자 2~12자
 *       - in: query
 *         name: excludeSelf
 *         required: false
 *         schema: { type: boolean }
 *         description: true 이고 Authorization 헤더가 있으면 "본인이 지금 쓰는 닉네임"은 중복으로 보지 않습니다. (프로필 수정 화면용)
 *     responses:
 *       200:
 *         description: 확인 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         available: { type: boolean }
 *       400:
 *         description: nickname 쿼리 파라미터 누락 또는 형식 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/check-nickname', async (req, res) => {
  const check = validateNickname(req.query.nickname);
  if (!check.ok) {
    return res.status(400).json({ success: false, data: null, message: check.message });
  }
  const nickname = check.nickname;

  // 프로필 수정 화면에서는 "지금 내가 쓰는 닉네임"이 중복으로 잡히면 안 되므로,
  // excludeSelf=true + 로그인 토큰이 있으면 본인은 검사 대상에서 제외합니다.
  let excludeUserId = null;
  if (String(req.query.excludeSelf) === 'true') {
    const token = extractBearerToken(req);
    if (token) {
      const verified = verifyAccessToken(token);
      // 토큰이 만료/위조면 그냥 "본인 제외 없이" 검사합니다. (조회 전용 API라 401까지는 두지 않음)
      if (verified.ok) excludeUserId = verified.payload.userId;
    }
  }

  try {
    const taken = await isNicknameTaken(pool, nickname, excludeUserId);
    return res.status(200).json({
      success: true,
      data: { available: !taken, nickname },
      message: taken ? '이미 사용 중인 닉네임입니다.' : '사용할 수 있는 닉네임입니다.',
    });
  } catch (error) {
    console.error('닉네임 중복 확인 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 닉네임 확인에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 로그인 (세션/토큰 발급)
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "seller01@example.com" }
 *               password: { type: string, example: "password123!" }
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthSessionData' }
 *       400:
 *         description: 이메일/비밀번호 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 이메일 또는 비밀번호 불일치
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
// 2. 로그인 API (이메일 + 비밀번호)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    // [C-01] 판매자 계정에 host 값이 남아 있어도 응답에서는 항상 seller 로 내려줍니다.
    //        (DB 쓰기를 하지 않으므로 activeRole 컬럼이 없는 DB에서도 로그인이 실패하지 않습니다.)
    user.activeRole = normalizeActiveRole(user.userType, user.activeRole);

    // [세션/토큰 발급] 기기별 세션을 만들고 토큰 2종을 발급합니다.
    const session = await issueSession({ userId: user.userId, userType: user.userType, req });

    return res.status(200).json({
      success: true,
      data: authPayload(session, user),
      message: '로그인 성공!',
    });
  } catch (error) {
    console.error('로그인 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류로 로그인에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: 액세스 토큰 재발급
 *     description: 리프레시 토큰으로 새 액세스 토큰을 받습니다. 보안을 위해 리프레시 토큰도 매번 새 값으로 교체됩니다.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: 재발급 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthSessionData' }
 *       400:
 *         description: refreshToken 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 리프레시 토큰 만료/폐기/위조 (재로그인 필요)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
// 3. 액세스 토큰 재발급 API [신규]
router.post('/refresh', async (req, res) => {
  const refreshToken = req.body?.refreshToken;

  if (!refreshToken) {
    return res.status(400).json({
      success: false, data: null, code: 'REFRESH_REQUIRED', message: '리프레시 토큰이 필요합니다.',
    });
  }

  try {
    const result = await refreshSession(refreshToken, req);

    if (!result.ok) {
      // REFRESH_UNAVAILABLE = auth_sessions 테이블 미생성 (마이그레이션 안내)
      const message = result.code === 'REFRESH_UNAVAILABLE'
        ? '서버에 세션 저장소가 준비되지 않았습니다. (node scripts/migrate-add-auth-sessions.js 실행 필요)'
        : '세션이 만료되었습니다. 다시 로그인해 주세요.';
      return res.status(401).json({ success: false, data: null, code: result.code, message });
    }

    // 재발급 시 최신 회원정보도 함께 내려줘서, 프론트의 loggedInUser 가 오래된 값으로 남지 않게 합니다.
    const [rows] = await pool.query('SELECT * FROM users WHERE userId = ?', [result.userId]);
    const user = rows[0] || null;

    return res.status(200).json({
      success: true,
      data: authPayload(result, user),
      message: '토큰이 재발급되었습니다.',
    });
  } catch (error) {
    console.error('토큰 재발급 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 토큰 재발급에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: 현재 세션 확인 (로그인 상태 및 회원정보 재동기화)
 *     description: 프론트가 sessionStorage 값만 믿지 않고 실제 세션이 살아 있는지 확인할 때 사용합니다.
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 유효한 세션
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user: { $ref: '#/components/schemas/User' }
 *                         sessionId: { type: string, nullable: true }
 *                         expiresAt: { type: string, format: date-time }
 *       401:
 *         description: 토큰 없음/만료/폐기
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
// 4. 세션 확인 API [신규]
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE userId = ?', [req.user.userId]);
    if (rows.length === 0) {
      return res.status(401).json({
        success: false, data: null, code: 'USER_NOT_FOUND', message: '탈퇴했거나 존재하지 않는 계정입니다.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: publicUser(rows[0]),
        sessionId: req.user.sid || null,
        // exp 는 초 단위라 1000을 곱해 ISO 로 바꿔 내려줍니다.
        expiresAt: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null,
        landingPath: landingPathFor(),
      },
      message: '유효한 세션입니다.',
    });
  } catch (error) {
    console.error('세션 확인 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 세션 확인에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 로그아웃 (서버 세션 폐기)
 *     description: 해당 세션을 서버에서 폐기해 액세스 토큰을 즉시 무효화합니다. 액세스 토큰이 이미 만료된 경우에도 body 에 refreshToken 을 보내면 폐기할 수 있습니다.
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string, description: "선택. 액세스 토큰이 만료된 상태에서 로그아웃할 때 사용" }
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { nullable: true, example: null }
 */
// 5. 로그아웃 API
// [보완] 기존에는 토큰 유효성만 확인하고 끝나서, 로그아웃 뒤에도 토큰이 만료 전까지 그대로 통했습니다.
//        이제 auth_sessions 의 해당 세션을 폐기해 서버가 그 토큰을 거부합니다.
//        (액세스 토큰이 만료된 상태여도 로그아웃은 되어야 하므로 authenticateToken 을 강제하지 않습니다.)
router.post('/logout', async (req, res) => {
  try {
    let revoked = false;

    const token = extractBearerToken(req);
    if (token) {
      const verified = verifyAccessToken(token);
      if (verified.ok && verified.payload.sid) {
        revoked = await revokeSession(verified.payload.sid);
      }
    }

    if (!revoked && req.body?.refreshToken) {
      revoked = await revokeSessionByRefreshToken(req.body.refreshToken);
    }

    return res.status(200).json({
      success: true,
      data: { revoked },
      message: '로그아웃되었습니다.',
    });
  } catch (error) {
    console.error('로그아웃 오류:', error.message);
    // 로그아웃은 실패해도 사용자 입장에선 로그아웃이 되어야 하므로 200 으로 응답합니다.
    return res.status(200).json({ success: true, data: { revoked: false }, message: '로그아웃되었습니다.' });
  }
});

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     summary: 모든 기기에서 로그아웃
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 폐기된 세션 수 반환
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         revokedCount: { type: integer }
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
// 6. 전체 로그아웃 API [신규]
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    const revokedCount = await revokeAllSessions(req.user.userId);
    return res.status(200).json({
      success: true,
      data: { revokedCount },
      message: `${revokedCount}개 기기에서 로그아웃했습니다.`,
    });
  } catch (error) {
    console.error('전체 로그아웃 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 전체 로그아웃에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     summary: 로그인 중인 기기(세션) 목록
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         sessions:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sessionId: { type: string }
 *                               userAgent: { type: string, nullable: true }
 *                               ipAddress: { type: string, nullable: true }
 *                               issuedAt: { type: string, format: date-time }
 *                               lastUsedAt: { type: string, format: date-time }
 *                               expiresAt: { type: string, format: date-time }
 *                               current: { type: boolean }
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
// 7. 세션 목록 API [신규]
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await listActiveSessions(req.user.userId);
    return res.status(200).json({
      success: true,
      data: {
        sessions: sessions.map((s) => ({ ...s, current: s.sessionId === req.user.sid })),
        accessTokenTtl: ACCESS_TOKEN_TTL,
        refreshTokenTtlDays: REFRESH_TOKEN_TTL_DAYS,
      },
      message: '로그인 중인 기기 목록입니다.',
    });
  } catch (error) {
    console.error('세션 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 세션 목록 조회에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/toggle-role:
 *   patch:
 *     summary: 역할 전환 (주최자 계정 전용, 주최자 <-> 판매자 단방향 정책)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 역할 전환 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ToggleRoleData' }
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 판매자 계정은 주최자로 전환 불가 (단방향 정책)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 사용자를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/toggle-role', authenticateToken, async (req, res) => {
  const { userId } = req.user;

  try {
    const [rows] = await pool.query('SELECT userType FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '사용자를 찾을 수 없습니다.' });
    }

    // [C-01] 역할 전환은 단방향입니다.
    //  - 주최자 계정: host <-> seller 전환 허용 (주최자는 판매자도 될 수 있음)
    //  - 판매자 계정: 전환 자체를 차단 (판매자는 주최자가 될 수 없음)
    if (!isHostType(rows[0].userType)) {
      return res.status(403).json({
        success: false,
        data: null,
        message: '판매자 계정은 주최자로 전환할 수 없습니다. 주최자 계정으로 가입해 주세요.',
      });
    }

    // activeRole 은 선택 컬럼이라, 없으면 안내 메시지를 주고 로그인 흐름에는 영향을 주지 않습니다.
    let currentRole = 'host';
    try {
      const [roleRows] = await pool.query('SELECT activeRole FROM users WHERE userId = ?', [userId]);
      currentRole = roleRows[0]?.activeRole === 'seller' ? 'seller' : 'host';
    } catch (columnError) {
      return res.status(500).json({
        success: false,
        data: null,
        message: 'users.activeRole 컬럼이 없습니다. backend 에서 node scripts/migrate-add-swagger-columns.js 를 한 번 실행해 주세요.',
      });
    }

    const nextRole = currentRole === 'host' ? 'seller' : 'host';
    await pool.query('UPDATE users SET activeRole = ? WHERE userId = ?', [nextRole, userId]);

    return res.status(200).json({
      success: true,
      data: { activeRole: nextRole },
      message: `${nextRole === 'host' ? '주최자' : '판매자'} 모드로 전환했습니다.`,
    });
  } catch (error) {
    console.error('역할 전환 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 역할 전환에 실패했습니다.' });
  }
});

export default router;
export { USER_TYPE };
