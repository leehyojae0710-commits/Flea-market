// backend/routes/myMarketRoutes.js
// [담당 D 신규] 마켓 관리 - 내 마켓 목록 조회 라우트
// - 기존 marketRoutes.js 의 GET /:marketId 와 경로 충돌을 피하기 위해
//   /api/markets/mine 이 아니라 완전히 별도 경로 /api/my-markets 로 분리했습니다.
// - swagger.js 가 routes/*.js 를 자동 스캔하므로 별도 설정 변경 없이 문서에 반영됩니다.

import express from 'express';
import { getMyMarkets } from '../controllers/myMarketController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: MyMarkets
 *   description: 내 마켓(주최자 본인) 관리
 */

/**
 * @swagger
 * /my-markets:
 *   get:
 *     summary: 내 마켓 목록 조회 (로그인한 주최자 본인)
 *     tags: [MyMarkets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: includeExpired
 *         description: "true 로 주면 마감(isExpired=1)된 마켓도 포함"
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: 내 마켓 목록
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/Market' } }
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
router.get('/', authenticateToken, getMyMarkets);

export default router;
