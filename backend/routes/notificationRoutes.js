// backend/routes/notificationRoutes.js
// [추가] 알림(종 버튼) 라우트
import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: 알림(종 버튼)
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: 내 알림 목록 조회 (최신순, 최대 50건)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 */
router.get('/', authenticateToken, getNotifications);

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: 안읽은 알림 개수 조회
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 */
router.get('/unread-count', authenticateToken, getUnreadCount);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     summary: 모든 알림 읽음 처리
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 처리 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 */
router.patch('/read-all', authenticateToken, markAllNotificationsRead);

/**
 * @swagger
 * /notifications/{notificationId}/read:
 *   patch:
 *     summary: 알림 1건 읽음 처리 (본인 알림만)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 처리 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 *       403:
 *         description: 본인의 알림이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 알림
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:notificationId/read', authenticateToken, markNotificationRead);

export default router;
