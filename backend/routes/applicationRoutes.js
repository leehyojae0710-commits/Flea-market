// backend/routes/applicationRoutes.js
// 담당 D: 부스 신청 / 승인 / 반려
import express from 'express';
import { applyForBooth, approveSellerApplication, rejectSellerApplication } from '../controllers/applicationController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Applications
 *   description: 부스 신청 / 승인 / 반려
 */

/**
 * @swagger
 * /applications:
 *   post:
 *     summary: 부스 신청
 *     tags: [Applications]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketId, boothNumber, itemName]
 *             properties:
 *               marketId: { type: integer }
 *               boothNumber: { type: string }
 *               itemName: { type: string }
 *               productDesc: { type: string }
 *               itemImage: { type: string }
 *     responses:
 *       201:
 *         description: 신청 완료
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ApplicationCreateData' }
 *       400:
 *         description: 필수 항목 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 마켓
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: 마감된 마켓
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticateToken, applyForBooth);

/**
 * @swagger
 * /applications/{applicationId}/approve:
 *   patch:
 *     summary: 신청 승인 (마켓 주최자 본인만)
 *     tags: [Applications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 승인 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ApplicationStatusData' }
 *       403:
 *         description: 본인 마켓의 신청 건이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 신청
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:applicationId/approve', authenticateToken, approveSellerApplication);

/**
 * @swagger
 * /applications/{applicationId}/reject:
 *   patch:
 *     summary: 신청 반려 (마켓 주최자 본인만)
 *     tags: [Applications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 반려 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ApplicationStatusData' }
 *       403:
 *         description: 본인 마켓의 신청 건이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 신청
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:applicationId/reject', authenticateToken, rejectSellerApplication);

export default router;
