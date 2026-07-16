// backend/routes/authRoutes.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

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
  };
}

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: 회원가입 / 로그인
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
 *             required: [userType, email, password, phone, region]
 *             properties:
 *               userType: { type: integer, description: "0: 판매자, 1: 주최자", example: 0 }
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
 */
// 1. 회원가입 API
router.post('/register', async (req, res) => {
  const { userType, email, password, phone, region } = req.body;

  if (userType === undefined || !email || !password || !phone || !region) {
    return res.status(400).json({ success: false, data: null, message: '필수 항목이 누락되었습니다.' });
  }

  try {
    const [existing] = await pool.query('SELECT email FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, data: null, message: '이미 가입된 이메일입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await pool.query(
      `INSERT INTO users (userType, password, phone, email, region)
       VALUES (?, ?, ?, ?, ?)`,
      [userType, hashedPassword, phone, email, region]
    );

    const userId = result.insertId;

    const token = jwt.sign({ userId, userType }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      data: { token, user: { userId, userType: Number(userType), email, phone, region } },
      message: '회원가입이 완료되었습니다.',
    });
  } catch (error) {
    console.error('회원가입 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 회원가입에 실패했습니다.' });
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
 */
// 2. 로그인 API (이메일 + 비밀번호)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, data: null, message: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, data: null, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, data: null, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = jwt.sign({ userId: user.userId, userType: user.userType }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true,
      data: { token, user: publicUser(user) },
      message: '로그인 성공!',
    });
  } catch (error) {
    console.error('로그인 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 로그인에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 로그아웃
 *     description: >
 *       JWT는 서버에 세션을 두지 않는(stateless) 방식이라 서버가 토큰을 강제로 만료시키지는 않습니다.
 *       이 API는 "로그아웃 처리를 서버에도 기록"하는 용도이며, 실제 로그아웃은 프론트에서
 *       토큰 삭제(localStorage.removeItem('token'))로 완료됩니다.
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 로그아웃 처리 완료
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { type: 'object', nullable: true, example: null }
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/logout', authenticateToken, (req, res) => {
  return res.status(200).json({ success: true, data: null, message: '로그아웃되었습니다.' });
});

/**
 * @swagger
 * /auth/toggle-role:
 *   patch:
 *     summary: 판매자 <-> 주최자 역할 전환
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
 *       404:
 *         description: 사용자를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/toggle-role', authenticateToken, async (req, res) => {
  const { userId } = req.user;

  try {
    const [rows] = await pool.query('SELECT activeRole FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '사용자를 찾을 수 없습니다.' });
    }

    const nextRole = rows[0].activeRole === 'host' ? 'seller' : 'host';
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
