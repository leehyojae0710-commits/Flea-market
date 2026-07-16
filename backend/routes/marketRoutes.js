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
import { authenticateToken, attachUserIfLoggedIn } from '../middleware/authMiddleware.js';

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
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [latest, eventDate] }
 *       - in: query
 *         name: includeExpired
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: 마켓 목록
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
 *       400:
 *         description: 필수 항목 누락
 *       401:
 *         description: 인증 필요
 */
router.get('/', attachUserIfLoggedIn, getMarketList);
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
 *       404:
 *         description: 존재하지 않는 마켓
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
 *       403:
 *         description: 본인 마켓이 아님
 *       404:
 *         description: 존재하지 않는 마켓
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
 *       403:
 *         description: 본인 마켓이 아님
 *       404:
 *         description: 존재하지 않는 마켓
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
 *       403:
 *         description: 본인 마켓이 아님
 *       404:
 *         description: 존재하지 않는 마켓
 */
router.get('/:marketId/applications', authenticateToken, getApplicationsByMarket);

export default router;