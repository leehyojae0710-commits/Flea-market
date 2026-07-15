// backend/routes/authRoutes.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'flea-market-dev-secret-change-me';
const SALT_ROUNDS = 10;

function publicUser(row) {
  // 비밀번호 해시 등 민감한 값은 프론트로 내려주지 않음
  return {
    userId: row.userId,
    userType: row.userType,
    email: row.email,
    phone: row.phone,
    region: row.region,
    activeRole: row.activeRole,
  };
}

// 1. 회원가입 API
router.post('/register', async (req, res) => {
  const { userType, email, password, phone, region } = req.body;

  if (userType === undefined || !email || !password || !phone || !region) {
    return res.status(400).json({ success: false, message: '필수 항목이 누락되었습니다.' });
  }

  // 회원가입 폼에 별도 아이디 입력란이 없으므로 email을 userId로 사용
  const userId = email;
  const activeRole = Number(userType) === 1 ? 'host' : 'seller';

  try {
    const [existing] = await pool.query(
      'SELECT userId FROM users WHERE userId = ? AND userType = ?',
      [userId, userType]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: '이미 가입된 이메일입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    await pool.query(
      `INSERT INTO users (userType, userId, password, phone, email, region, activeRole)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userType, userId, hashedPassword, phone, email, region, activeRole]
    );

    const token = jwt.sign({ userId, userType }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      data: { token, user: { userId, userType: Number(userType), email, phone, region, activeRole } },
      message: '회원가입이 완료되었습니다.',
    });
  } catch (error) {
    console.error('회원가입 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류로 회원가입에 실패했습니다.' });
  }
});

// 2. 로그인 API
router.post('/login', async (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력해주세요.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE userId = ?', [userId]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
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

export default router;
