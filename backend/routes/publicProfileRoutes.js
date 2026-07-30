// backend/routes/publicProfileRoutes.js
// [신규] 다른 사람 프로필 열람용 라우트.
//
// /api/users 가 아니라 /api/profiles 라는 별도 prefix 를 씁니다.
// (/api/users 에 :userId 파라미터 라우트를 추가하면 팀원들이 만든 /users/... 경로를
//  가려버릴 수 있어서, 충돌 없는 새 prefix 로 분리했습니다.)

import express from 'express';
import { getPublicProfile, getPublicProfileReviews } from '../controllers/publicProfileController.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: PublicProfile
 *   description: 다른 사용자 프로필 열람 (마켓 상세의 주최자, 신청자 목록의 판매자 등)
 */

/**
 * @swagger
 * /profiles/{userId}:
 *   get:
 *     summary: 사용자 공개 프로필 조회 (닉네임/사진/소개 + 역할별 활동 요약 + 평가 요약)
 *     tags: [PublicProfile]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 조회 성공. 이메일·전화번호·거주지역은 포함하지 않습니다.
 *       400:
 *         description: 올바르지 않은 사용자 번호
 *       404:
 *         description: 사용자를 찾을 수 없음
 */
router.get('/:userId', getPublicProfile);

/**
 * @swagger
 * /profiles/{userId}/reviews:
 *   get:
 *     summary: 사용자 공개 평가 목록 (최신 20건)
 *     tags: [PublicProfile]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 조회 성공
 *       404:
 *         description: 사용자를 찾을 수 없음
 */
router.get('/:userId/reviews', getPublicProfileReviews);

export default router;
