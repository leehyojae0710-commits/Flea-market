// backend/routes/userRoutes.js
// 회원 정보 수정 / 탈퇴 (신규 파일)
import express from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();
const SALT_ROUNDS = 10;

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: 내 회원 정보 수정/탈퇴
 */

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: 회원 정보 수정 (전화번호/지역/비밀번호)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone: { type: string }
 *               region: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/UserUpdateData' }
 *       400:
 *         description: 수정할 내용 없음
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/me', authenticateToken, async (req, res) => {
  const { userId } = req.user;
  const { phone, region, password } = req.body;

  const fields = [];
  const values = [];
  if (phone) { fields.push('phone = ?'); values.push(phone); }
  if (region) { fields.push('region = ?'); values.push(region); }
  if (password) { fields.push('password = ?'); values.push(await bcrypt.hash(password, SALT_ROUNDS)); }

  if (fields.length === 0) {
    return res.status(400).json({ success: false, data: null, message: '수정할 내용이 없습니다.' });
  }

  try {
    values.push(userId);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE userId = ?`, values);

    const [rows] = await pool.query('SELECT userId, userType, email, phone, region FROM users WHERE userId = ?', [userId]);
    return res.status(200).json({ success: true, data: rows[0], message: '회원 정보가 수정되었습니다.' });
  } catch (error) {
    console.error('회원 정보 수정 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 회원 정보 수정에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: 회원 탈퇴
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 탈퇴 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { type: object, nullable: true, example: null }
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/me', authenticateToken, async (req, res) => {
  const { userId } = req.user;
  try {
    await pool.query('DELETE FROM users WHERE userId = ?', [userId]);
    return res.status(200).json({ success: true, data: null, message: '회원 탈퇴가 완료되었습니다.' });
  } catch (error) {
    console.error('회원 탈퇴 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 회원 탈퇴에 실패했습니다.' });
  }
});

export default router;
