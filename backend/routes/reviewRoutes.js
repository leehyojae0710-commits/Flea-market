// backend/routes/reviewRoutes.js
// [추가] 행사 평가(별점) 기능

import express from 'express';
import { createReview, getMarketReviewSummary } from '../controllers/reviewController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: 행사 평가(별점)
 */

/**
 * @swagger
 * /reviews:
 *   post:
 *     summary: 행사 별점 평가 등록 (승인된 부스 신청자 본인, 행사 종료 후에만)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [applicationId, rating]
 *             properties:
 *               applicationId: { type: integer }
 *               rating: { type: integer, minimum: 0, maximum: 5 }
 *     responses:
 *       201:
 *         description: 등록 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 *       400:
 *         description: 필수 항목 누락 / 별점 범위 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 본인의 신청 건이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 신청
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: 승인되지 않은 신청 / 행사 미종료 / 이미 평가함
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticateToken, createReview);

/**
 * @swagger
 * /reviews/market/{marketId}:
 *   get:
 *     summary: 특정 마켓의 평균 별점 / 평가 개수 조회
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/market/:marketId', getMarketReviewSummary);

export default router;
