// backend/routes/authRoutes.js
import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'flea-market-dev-secret-change-me';
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
 * @swagger
 * tags:
 *   name: Auth
 *   description: 회원가입 / 로그인 / 역할 전환
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
 *         description: 회원가입 성공 (토큰 발급)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthData' }
 *       400:
 *         description: 필수 항목 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: 이미 가입된 이메일
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
  // [수정] 존재 여부 + 형식(정규식) 검증은 validateRegisterInput 미들웨어에서 끝났으므로,
  //        여기서는 DB 중복 체크 등 비즈니스 로직만 처리합니다.
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
      // [수정] activeRole 은 users 테이블에 없을 수도 있는 선택 컬럼이라 INSERT 대상에서 제외합니다.
      //        (역할은 userType 으로 판정하고, activeRole 은 화면 모드 표시용일 뿐입니다.)
      `INSERT INTO users (userType, password, phone, email, region, nickname)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userTypeNum, hashedPassword, phone, email, region, nickname]
    );

    const userId = result.insertId;

    const token = jwt.sign({ userId, userType: userTypeNum }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          userId,
          userType: userTypeNum,
          email,
          phone,
          region,
          nickname,
          activeRole: normalizeActiveRole(userTypeNum, null),
          canBeHost: isHostType(userTypeNum),
        },
        landingPath: landingPathFor(userTypeNum),
      },
      message: '회원가입이 완료되었습니다.',
    });
  } catch (error) {
    // [닉네임] 동시에 같은 닉네임으로 가입 요청이 들어오면 위 SELECT 검사를 통과할 수 있습니다.
    //          최종 방어선은 users.nickname UNIQUE 인덱스이고, 그 오류를 409로 바꿔서 내려줍니다.
    //          (인덱스 생성: node scripts/migrate-add-nickname-unique.js)
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
  // [수정] 존재 여부만 보던 것을 회원가입과 같은 형식 검증(길이/문자/예약어)까지 하도록 맞췄습니다.
  //        형식이 틀리면 400 + 사유 메시지를 주므로, 프론트는 result.message 를 그대로 보여주면 됩니다.
  const check = validateNickname(req.query.nickname);
  if (!check.ok) {
    return res.status(400).json({ success: false, data: null, message: check.message });
  }
  const nickname = check.nickname;

  // [추가] 프로필 수정 화면에서는 "지금 내가 쓰는 닉네임"이 중복으로 잡히면 안 되므로,
  //        excludeSelf=true + 로그인 토큰이 있으면 본인은 검사 대상에서 제외합니다.
  let excludeUserId = null;
  if (String(req.query.excludeSelf) === 'true') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      try {
        excludeUserId = jwt.verify(token, JWT_SECRET).userId;
      } catch (tokenError) {
        // 토큰이 만료/위조된 경우엔 그냥 "본인 제외 없이" 검사합니다. (조회 전용 API라 401까지는 두지 않음)
        excludeUserId = null;
      }
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
 *     summary: 로그인
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
 *         description: 로그인 성공 (토큰 발급)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/AuthData' }
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

    const token = jwt.sign({ userId: user.userId, userType: user.userType }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true,
      data: {
        token,
        user: publicUser(user),
        // 프론트는 이 값을 그대로 써도 되고, role-routing.js 규칙을 써도 됩니다.
        landingPath: landingPathFor(user.userType),
      },
      message: '로그인 성공!',
    });
  } catch (error) {
    console.error('로그인 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류로 로그인에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 로그아웃
 *     description: JWT는 서버에 상태를 저장하지 않으므로(stateless), 이 API는 토큰 유효성만 확인하고 로그아웃 처리를 승인합니다. 실제 토큰/세션 삭제는 클라이언트(sessionStorage)에서 수행합니다.
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
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
 *       401:
 *         description: 인증 필요 (토큰 없음 또는 만료)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
// 3. 로그아웃 API
// [수정] 기존에는 서버 라우트가 없어 logoutUser()가 sessionStorage만 지웠음.
//        JWT는 stateless라 서버가 토큰을 별도로 무효화하지는 않지만,
//        토큰 유효성 검증 + 요청 흐름 확인용으로 라우트를 신설함.
router.post('/logout', authenticateToken, (req, res) => {
  return res.status(200).json({ success: true, data: null, message: '로그아웃되었습니다.' });
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
