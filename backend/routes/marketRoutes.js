// backend/routes/marketRoutes.js
// 마켓(공고) 라우트 - 조회는 담당 C, 등록/신청목록은 담당 D, 좌표 저장은 담당 E
import express from 'express';
import {
  getMarketList,
  getMarketDetail,
  createMarket,
  updateMarketStatus,
  updateMarketLocation,
  getApplicationsByMarket,
} from '../controllers/marketController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Markets
 *   description: 마켓(공고) 조회/등록/수정
 */

/**
 * @swagger
 * /markets:
 *   get:
 *     summary: 마켓 목록 조회 (필터/정렬)
 *     tags: [Markets]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: region
 *         description: 주최자의 users.region 기준 필터
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         description: eventDate=개최일 오름차순(마감임박순), 그 외 값(latest 등)은 최신등록순
 *         schema: { type: string, enum: [latest, eventDate] }
 *       - in: query
 *         name: includeExpired
 *         description: "true 로 주면 마감(isExpired=1)된 마켓도 포함"
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: 마켓 목록
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/Market' } }
 *   post:
 *     summary: 마켓 등록
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, eventDate, locationName]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               marketImage: { type: string }
 *               locationName: { type: string }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               eventDate: { type: string, format: date }
 *               boothPrice: { type: integer }
 *     responses:
 *       201:
 *         description: 등록 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/MarketCreateData' }
 *       400:
 *         description: 필수 항목 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: 인증 필요
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', getMarketList);
router.post('/', authenticateToken, createMarket);

/**
 * @swagger
 * /markets/{marketId}:
 *   get:
 *     summary: 마켓 상세 조회
 *     tags: [Markets]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 마켓 상세 정보
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Market' }
 *       404:
 *         description: 존재하지 않는 마켓
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   patch:
 *     summary: 마켓 상태/정보 수정 (마감 처리 등, 주최자 본인만)
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isExpired: { type: boolean }
 *               title: { type: string }
 *               description: { type: string }
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
 *                     data: { type: object, nullable: true, example: null }
 *       400:
 *         description: 수정할 내용 없음
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 본인 마켓이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 마켓
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:marketId', getMarketDetail);
router.patch('/:marketId', authenticateToken, updateMarketStatus);

/**
 * @swagger
 * /markets/{marketId}/location:
 *   patch:
 *     summary: 마켓 지도 좌표 저장 (담당 E)
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               locationName: { type: string }
 *     responses:
 *       200:
 *         description: 저장 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/MarketLocationData' }
 *       400:
 *         description: 위도/경도 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 본인 마켓이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 마켓
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:marketId/location', authenticateToken, updateMarketLocation);

/**
 * @swagger
 * /markets/{marketId}/applications:
 *   get:
 *     summary: 셀러 신청 목록 조회 (주최자 본인만)
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 신청 목록
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/Application' } }
 *       403:
 *         description: 본인 마켓이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 마켓
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:marketId/applications', authenticateToken, getApplicationsByMarket);

export default router;
