// backend/routes/auth.js
import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// 1. 임시 회원가입 API (userType 반영)
router.post('/signup', async (req, res) => {
  const { userType, userId, password, phone, email, region } = req.body;
  
  // userType에 따라 activeRole 기본값 세팅
  const activeRole = userType === 1 ? 'host' : 'seller';

  try {
    const query = `
      INSERT INTO users (userType, userId, password, phone, email, region, activeRole)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await pool.query(query, [userType, userId, password, phone, email, region, activeRole]);
    
    res.status(21)
  } catch (error) {
    res.status(500)
  }
});

// 2. 임시 로그인 API (현재 활성화된 역할 모드 반환)
router.post('/login', async (req, res) => {
  const { userId, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE userId = ? AND password = ?', [userId, password]);
    
    if (rows.length > 0) {
      res.status(200)
    } else {
      res.status(401)
    }
  } catch (error) {
    res.status(500)
  }
});

export default router;