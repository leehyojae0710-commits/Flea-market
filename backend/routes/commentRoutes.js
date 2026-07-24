// backend/routes/commentRoutes.js
// 담당 D: 댓글 (공고/판매자 페이지 공용)
import express from 'express';
import { createComment, getCommentList } from '../controllers/commentController.js';
import { deleteComment } from '../controllers/dbdeleteController.js';
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
 *               parentId: { type: integer, nullable: true, description: '대댓글일 경우 부모 댓글의 commentId' }
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
 *                     data: { $ref: '#/components/schemas/CommentCreateData' }
 *       400:
 *         description: 필수 항목 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/Comment' } }
 *       400:
 *         description: 쿼리 파라미터 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticateToken, createComment);
router.get('/', getCommentList);

/**
 * @swagger
 * /comments/{commentId}:
 *   delete:
 *     summary: 댓글 삭제 (본인 댓글만)
 *     tags: [Comments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 삭제 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 *       403:
 *         description: 본인 댓글이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: 존재하지 않는 댓글
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete('/:commentId', authenticateToken, deleteComment);

export default router;
