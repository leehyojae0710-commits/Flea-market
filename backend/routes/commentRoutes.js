// backend/routes/commentRoutes.js
// 담당 D: 댓글 (공고/판매자 페이지 공용)
import express from 'express';
import { createComment, getCommentList } from '../controllers/commentController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Comments
 *   description: 댓글 등록/조회
 */

/**
 * @swagger
 * /comments:
 *   post:
 *     summary: 댓글 등록
 *     tags: [Comments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetType, targetId, content]
 *             properties:
 *               targetType: { type: string, example: market }
 *               targetId: { type: integer }
 *               content: { type: string }
 *     responses:
 *       201:
 *         description: 등록 성공
 *       400:
 *         description: 필수 항목 누락
 *   get:
 *     summary: 댓글 목록 조회
 *     tags: [Comments]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: targetType
 *         required: true
 *         schema: { type: string, example: market }
 *       - in: query
 *         name: targetId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 댓글 목록
 *       400:
 *         description: 쿼리 파라미터 누락
 */
router.post('/', authenticateToken, createComment);
router.get('/', getCommentList);

export default router;
