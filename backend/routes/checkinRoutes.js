// backend/routes/checkinRoutes.js
// 담당 E: 지도/QR 연동
import express from 'express';
import { generateEntranceQRCode } from '../controllers/checkinController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Checkins
 *   description: 입장용 QR 코드 발급
 */

/**
 * @swagger
 * /checkins/{userId}/qrcode:
 *   get:
 *     summary: 입장용 QR 코드 발급 (본인 것만)
 *     tags: [Checkins]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: QR 코드 발급 성공 (data.qrImage는 base64 PNG data URL)
 *       403:
 *         description: 본인 것이 아님
 *       404:
 *         description: 사용자를 찾을 수 없음
 */
router.get('/:userId/qrcode', authenticateToken, generateEntranceQRCode);

export default router;
