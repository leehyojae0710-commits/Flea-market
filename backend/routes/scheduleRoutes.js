// backend/routes/scheduleRoutes.js
// 담당 D: 내 일정(주최/참가) 조회
import express from 'express';
import { getMySchedule } from '../controllers/scheduleController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Schedules
 *   description: 내 일정 조회
 */

/**
 * @swagger
 * /schedules/me:
 *   get:
 *     summary: 내 일정 조회 (내가 주최하는 마켓 + 내가 신청한 부스)
 *     tags: [Schedules]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 일정 목록
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ScheduleData' }
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
router.get('/me', authenticateToken, getMySchedule);

export default router;
