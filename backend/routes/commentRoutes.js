// backend/routes/commentRoutes.js
// 담당 D: 댓글 (공고/판매자 페이지 공용)
import express from 'express';
import { createComment, getCommentList, updateComment } from '../controllers/commentController.js';
import { deleteComment } from '../controllers/dbdeleteController.js';
import { authenticateToken, optionalAuth } from '../middleware/authMiddleware.js';

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
 *               visibility:
 *                 type: string
 *                 enum: [public, host_only, seller_only]
 *                 default: public
 *                 description: >-
 *                   public=전체공개 / host_only=주최자 외 비공개(판매자가 작성) /
 *                   seller_only=판매자 외 비공개(주최자가 판매자 댓글에 답글). 
 *                   비공개 댓글의 답글은 서버가 부모 값을 자동 상속하므로 이 값은 무시됩니다.
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
 *     summary: 댓글 목록 조회 (비공개 댓글은 열람 권한자에게만 반환)
 *     description: 로그인 토큰이 있으면 본인/주최자에게 허용된 비공개 댓글까지 함께 반환합니다.
 *     tags: [Comments]
 *     security: [{ bearerAuth: [] }, {}]
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
router.get('/', optionalAuth, getCommentList);

/**
 * @swagger
 * /comments/{commentId}:
 *   patch:
 *     summary: 댓글 수정 (본인 댓글만)
 *     tags: [Comments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string }
 *     responses:
 *       200:
 *         description: 수정 성공
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApiEnvelope' }
 *       400:
 *         description: content 누락
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
router.patch('/:commentId', authenticateToken, updateComment);

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
