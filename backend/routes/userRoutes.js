// backend/routes/userRoutes.js
import express from 'express';
import pool from '../config/db.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// 회원정보 수정 (phone, region만)
router.patch('/me', verifyToken, async (req, res) => {
  const { userId } = req.user;
  const { phone, region } = req.body;

  if (!phone && !region) {
    return res.status(400).json({ success: false, message: '수정할 항목이 없습니다.' });
  }

  try {
    const fields = [];
    const values = [];
    if (phone) { fields.push('phone = ?'); values.push(phone); }
    if (region) { fields.push('region = ?'); values.push(region); }
    values.push(userId);

    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE userId = ?`, values);

    const [rows] = await pool.query('SELECT userId, userType, email, phone, region FROM users WHERE userId = ?', [userId]);
    return res.status(200).json({ success: true, data: rows[0], message: '회원정보가 수정되었습니다.' });
  } catch (error) {
    console.error('회원정보 수정 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류로 수정에 실패했습니다.' });
  }
});

// 회원 탈퇴
router.delete('/me', verifyToken, async (req, res) => {
  const { userId } = req.user;
  try {
    await pool.query('DELETE FROM users WHERE userId = ?', [userId]);
    return res.status(200).json({ success: true, data: null, message: '회원 탈퇴가 완료되었습니다.' });
  } catch (error) {
    console.error('회원 탈퇴 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류로 탈퇴에 실패했습니다.' });
  }
});

export default router;