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
 *       400:
 *         description: 필수 항목 누락
 *       409:
 *         description: 이미 가입된 이메일
 */
// 1. 회원가입 API
router.post('/register', async (req, res) => {
  const { userType, email, password, phone, region } = req.body;

  if (userType === undefined || !email || !password || !phone || !region) {
    return res.status(400).json({ success: false, message: '필수 항목이 누락되었습니다.' });
  }

  try {
    const [existing] = await pool.query('SELECT email FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: '이미 가입된 이메일입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // userId는 더 이상 직접 안 만들고, DB auto_increment가 자동 발급
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
    return res.status(500).json({ success: false, message: '서버 오류로 회원가입에 실패했습니다.' });
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
 *       400:
 *         description: 이메일/비밀번호 누락
 *       401:
 *         description: 이메일 또는 비밀번호 불일치
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

    const token = jwt.sign({ userId: user.userId, userType: user.userType }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true,
      data: { token, user: publicUser(user) },
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
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: 로그아웃 처리됨 (클라이언트에서 토큰 삭제)
 */
// 3. 로그아웃 (JWT는 서버가 따로 세션을 안 갖고 있으니, 클라이언트가 토큰 삭제하면 됨. 서버는 형식만 응답)
router.post('/logout', (req, res) => {
  return res.status(200).json({ success: true, data: null, message: '로그아웃되었습니다.' });
});

// 4. 비밀번호 변경 (로그인 필요)
router.patch('/password', authenticateToken, async (req, res) => {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: '새 비밀번호는 8자 이상이어야 합니다.' });
  }

  try {
    const [rows] = await pool.query('SELECT password FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '현재 비밀번호가 일치하지 않습니다.' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query('UPDATE users SET password = ? WHERE userId = ?', [hashedNewPassword, userId]);

    return res.status(200).json({ success: true, data: null, message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    console.error('비밀번호 변경 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류로 비밀번호 변경에 실패했습니다.' });
  }
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
 *       401:
 *         description: 인증 필요
 *       404:
 *         description: 사용자를 찾을 수 없음
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