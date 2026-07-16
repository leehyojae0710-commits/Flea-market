// backend/routes/payRoutes.js
// 담당 D: 모의 결제 (실제 PG 연동은 3주 일정상 제외)
import express from 'express';
import { processFakePayment } from '../controllers/payController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: 모의 결제
 */

/**
 * @swagger
 * /payments/fake:
 *   post:
 *     summary: 모의 결제 처리 (승인된 신청 건만 가능)
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [applicationId]
 *             properties:
 *               applicationId: { type: integer }
 *     responses:
 *       201:
 *         description: 결제 완료
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/PaymentData' }
 *       400:
 *         description: applicationId 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 본인 신청 건이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 신청
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: 승인되지 않은 신청
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/fake', authenticateToken, processFakePayment);

export default router;
