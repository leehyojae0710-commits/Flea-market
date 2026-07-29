// backend/routes/userRoutes.js
// 회원 정보 수정 / 탈퇴
//
// [로그아웃 처리 보완] 변경 요약
//   기존 문제
//     1) 비밀번호를 바꿔도 이미 발급된 토큰/세션이 그대로 살아 있었습니다.
//        -> 비밀번호가 유출돼 다른 기기에서 로그인된 상태라면, 비번을 바꿔도 그 기기는 계속 로그인 상태입니다.
//     2) 회원 탈퇴 시 users 행만 지우고 auth_sessions 를 정리하지 않았습니다.
//        -> authenticateToken 은 users 테이블을 조회하지 않으므로,
//           탈퇴한 계정의 액세스 토큰으로 만료 전까지 API 호출이 계속 가능했습니다. (실질적인 보안 구멍)
//   보완
//     1) 비밀번호 변경(PATCH /users/me, PATCH /users/me/password) 시 -> 현재 세션만 남기고 나머지 전부 폐기
//     2) 회원 탈퇴(DELETE /users/me) 시 -> 해당 사용자의 세션 전부 삭제
//     3) 응답에 revokedSessions / sessionsRemoved 를 추가 (기존 필드는 그대로라 프론트 수정 불필요)
//
// auth_sessions 테이블이 없는 환경(마이그레이션 미적용)에서는 폐기 함수가 0을 돌려주고 조용히 넘어갑니다.

import express from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
// [로그아웃 처리 보완] 세션 폐기/삭제는 utills/tokenService.js 한 곳에서 관리합니다.
import { revokeAllSessions, deleteUserSessions } from '../utills/tokenService.js';

const router = express.Router();
const SALT_ROUNDS = 10;

// [수정] 서버측 형식 검증 없이 phone 값을 그대로 저장하고 있었음.
// frontend/common/js/validators.js 의 PHONE_REGEX 와 동일한 규칙 (010-0000-0000 형식).
const PHONE_REGEX = /^01[0-9]-\d{3,4}-\d{4}$/;

/**
 * [로그아웃 처리 보완] 비밀번호가 바뀐 계정의 다른 기기 세션을 정리합니다.
 * - 지금 요청을 보낸 세션(req.user.sid)은 남겨서, 비번 바꾸자마자 튕기지 않도록 합니다.
 * - 세션 테이블이 없거나 DB 오류가 나도 비밀번호 변경 자체는 성공 처리합니다.
 */
async function revokeOtherSessionsSafely(req) {
  try {
    return await revokeAllSessions(req.user.userId, req.user.sid || null);
  } catch (error) {
    console.error('[userRoutes] 비밀번호 변경 후 세션 폐기 실패(무시하고 진행):', error.message);
    return 0;
  }
}

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
 *     description: |
 *       비밀번호를 함께 변경하려면 currentPassword(현재 비밀번호)를 반드시 같이 보내야 하며,
 *       서버가 이를 검증한 뒤에만 비밀번호가 바뀝니다. 변경에 성공하면 지금 사용 중인 기기를 제외한
 *       다른 모든 기기의 세션이 폐기됩니다.
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
 *               currentPassword: { type: string, description: "password 를 보낼 때 필수. 현재 비밀번호 확인용." }
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
 *         description: 수정할 내용 없음 / 전화번호 형식 오류 / password 변경 시 currentPassword 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 인증 필요 / 현재 비밀번호 불일치
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
router.patch('/me', authenticateToken, async (req, res) => {
  const { userId } = req.user;
  const { phone, region, password, currentPassword } = req.body;

  // [수정] 프론트(profile-edit.js)는 isValidPhone()으로 형식을 검증하지만,
  // 서버는 값을 그대로 저장했음. API를 직접 호출하면 형식이 깨진 전화번호도 저장될 수 있어 서버측 검증을 추가함.
  if (phone && !PHONE_REGEX.test(phone.trim())) {
    return res.status(400).json({ success: false, data: null, message: '전화번호는 010-0000-0000 형식으로 입력해주세요.' });
  }

  // [보안 수정] 이 엔드포인트는 원래 password 필드를 같이 보내면 현재 비밀번호 확인 없이 바로 바꿔줬음.
  // PATCH /users/me/password 는 currentPassword 를 확인하는데 여기는 확인하지 않아서,
  // 세션/토큰만 탈취해도(로그인 상태만 있으면) 비밀번호를 마음대로 바꿀 수 있는 구멍이었음.
  // 이제 password 를 바꾸려면 currentPassword 를 같이 보내야 하고, DB의 해시와 일치할 때만 반영됨.
  let hashedPassword = null;
  if (password) {
    if (!currentPassword) {
      return res.status(400).json({ success: false, data: null, message: '비밀번호를 변경하려면 현재 비밀번호를 함께 입력해주세요.' });
    }

    const [userRows] = await pool.query('SELECT password FROM users WHERE userId = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '사용자를 찾을 수 없습니다.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, userRows[0].password);
    if (!isMatch) {
      return res.status(401).json({ success: false, data: null, message: '현재 비밀번호가 일치하지 않습니다.' });
    }

    hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  }

  const fields = [];
  const values = [];
  if (phone) { fields.push('phone = ?'); values.push(phone); }
  if (region) { fields.push('region = ?'); values.push(region); }
  if (hashedPassword) { fields.push('password = ?'); values.push(hashedPassword); }

  if (fields.length === 0) {
    return res.status(400).json({ success: false, data: null, message: '수정할 내용이 없습니다.' });
  }

  try {
    values.push(userId);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE userId = ?`, values);

    // [로그아웃 처리 보완] 비밀번호를 바꿨다면 다른 기기 세션을 모두 끊습니다.
    let revokedSessions = 0;
    if (password) revokedSessions = await revokeOtherSessionsSafely(req);

    const [rows] = await pool.query('SELECT userId, userType, email, phone, region FROM users WHERE userId = ?', [userId]);
    return res.status(200).json({
      success: true,
      data: Object.assign({}, rows[0], { revokedSessions }),
      message: password && revokedSessions > 0
        ? `회원 정보가 수정되었습니다. 보안을 위해 다른 기기 ${revokedSessions}곳에서 로그아웃되었습니다.`
        : '회원 정보가 수정되었습니다.',
    });
  } catch (error) {
    console.error('회원 정보 수정 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 회원 정보 수정에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /users/me/password:
 *   patch:
 *     summary: 비밀번호 변경 (현재 비밀번호 확인 후 변경)
 *     description: 변경에 성공하면 지금 사용 중인 기기를 제외한 다른 모든 기기의 세션이 폐기됩니다.
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200:
 *         description: 비밀번호 변경 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         revokedSessions: { type: integer, description: "폐기된 다른 기기 세션 수" }
 *       400:
 *         description: 필수 항목 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 현재 비밀번호 불일치 / 인증 필요
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
router.patch('/me/password', authenticateToken, async (req, res) => {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, data: null, message: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const [rows] = await pool.query('SELECT password FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '사용자를 찾을 수 없습니다.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) {
      return res.status(401).json({ success: false, data: null, message: '현재 비밀번호가 일치하지 않습니다.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query('UPDATE users SET password = ? WHERE userId = ?', [hashedPassword, userId]);

    // [로그아웃 처리 보완] 비밀번호가 바뀌었으므로 다른 기기 세션을 모두 끊습니다.
    // (지금 요청을 보낸 세션은 남겨서 사용자가 바로 튕기지 않게 합니다.)
    const revokedSessions = await revokeOtherSessionsSafely(req);

    return res.status(200).json({
      success: true,
      data: { revokedSessions },
      message: revokedSessions > 0
        ? `비밀번호가 변경되었습니다. 보안을 위해 다른 기기 ${revokedSessions}곳에서 로그아웃되었습니다.`
        : '비밀번호가 변경되었습니다.',
    });
  } catch (error) {
    console.error('비밀번호 변경 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 비밀번호 변경에 실패했습니다.' });
  }
});

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: 회원 탈퇴
 *     description: 탈퇴 시 해당 계정의 모든 로그인 세션이 즉시 삭제되어, 남아 있던 액세스 토큰도 곧바로 무효가 됩니다.
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
 *                     data:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         sessionsRemoved: { type: integer, description: "삭제된 로그인 세션 수" }
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
    // [로그아웃 처리 보완] 순서가 중요합니다.
    //   users 를 먼저 지우면, 그 사이에 들어온 요청이 "세션은 살아 있는데 계정만 없는" 상태를 통과할 수 있습니다.
    //   그래서 세션을 먼저 끊고 계정을 지웁니다.
    let sessionsRemoved = 0;
    try {
      sessionsRemoved = await deleteUserSessions(userId);
    } catch (error) {
      console.error('[userRoutes] 탈퇴 시 세션 삭제 실패(탈퇴는 계속 진행):', error.message);
    }

    await pool.query('DELETE FROM users WHERE userId = ?', [userId]);

    return res.status(200).json({
      success: true,
      data: { sessionsRemoved },
      message: '회원 탈퇴가 완료되었습니다.',
    });
  } catch (error) {
    console.error('회원 탈퇴 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 회원 탈퇴에 실패했습니다.' });
  }
});

export default router;
