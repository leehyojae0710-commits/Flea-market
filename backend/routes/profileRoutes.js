// backend/routes/profileRoutes.js
// [신규] 마이페이지 "프로필 보기" 화면 전용 라우트
// - 기존 routes/userRoutes.js와 같은 /api/users prefix를 쓰지만, 경로가 겹치지 않는
//   /me/profile, /me/stats만 새로 추가하므로 userRoutes.js는 건드리지 않습니다.

import express from 'express';
import { getMyProfile, updateMyProfile, getMyEventStats, getMyActivityBreakdown } from '../controllers/profileController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: 마이페이지 프로필(닉네임/소개/행사현황)
 */

/**
 * @swagger
 * /users/me/profile:
 *   get:
 *     summary: 내 프로필 조회 (닉네임/프로필사진/한줄소개/소개글/소개이미지)
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 조회 성공
 *       401:
 *         description: 인증 필요
 */
router.get('/me/profile', authenticateToken, getMyProfile);

/**
 * @swagger
 * /users/me/profile:
 *   patch:
 *     summary: 내 프로필 수정 (닉네임/한줄소개/소개글/이미지 경로)
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname: { type: string }
 *               introText: { type: string }
 *               bioText: { type: string }
 *               profileImage: { type: string }
 *               bioImage: { type: string }
 *     responses:
 *       200:
 *         description: 수정 성공
 *       400:
 *         description: 수정할 내용 없음
 *       401:
 *         description: 인증 필요
 */
router.patch('/me/profile', authenticateToken, updateMyProfile);

/**
 * @swagger
 * /users/me/stats:
 *   get:
 *     summary: 내 행사 현황 (진행중/예정, 지난 행사, 취소 이력 건수)
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 조회 성공
 *       401:
 *         description: 인증 필요
 */
router.get('/me/stats', authenticateToken, getMyEventStats);

/**
 * @swagger
 * /users/me/activity:
 *   get:
 *     summary: 내 활동 현황 분포 (모집중/진행/종료/취소 건수) - 주최자 전용
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 조회 성공
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 주최자 전용
 */
router.get('/me/activity', authenticateToken, getMyActivityBreakdown);

export default router;
