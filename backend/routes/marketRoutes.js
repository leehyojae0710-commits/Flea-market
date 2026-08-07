// backend/routes/marketRoutes.js
// 마켓(공고) 라우트 - 조회는 담당 C, 등록/신청목록은 담당 D, 좌표 저장은 담당 E
// [추가] 부스 배치(드래그 앤 드롭), 정산 관리, 결제 대기열 타임아웃
import express from 'express';
import {
  getMarketList,
  getMarketDetail,
  createMarket,
  updateMarketStatus,
  getApplicationsByMarket,
  getMyMarket,
} from '../controllers/marketController.js';
import { authenticateToken, optionalAuth } from '../middleware/authMiddleware.js';
import { requireHost } from '../middleware/hostOnlyMiddleware.js';
import { validateMarketInput } from '../middleware/marketValidationMiddleware.js';
import { deleteMarket } from '../controllers/dbdeleteController.js';

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
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', getMarketList);

// [정리] POST / 는 requireHost + validateMarketInput 를 거치는 아래 정의 하나로 통합됨

/**
 * @swagger
 * /markets/mine:
 *   get:
 *     summary: 내 마켓 목록 조회 (로그인한 주최자 본인)
 *     description: "본인이 개설한 마켓을 모집중/마감/취소 전부 반환합니다. includeExpired=false 를 주면 모집중(isExpired=0)만 반환합니다. 각 항목에 appliedBooths(신청 부스 수)가 포함됩니다."
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: includeExpired
 *         description: "false 로 주면 마감/취소된 마켓 제외 (기본값 true)"
 *         schema: { type: boolean }
 *       - in: query
 *         name: sort
 *         description: "정렬 기준 - recruitEnd(모집마감순) / region(지역순) / eventDate(개최순) / latest(기본, 진행중 우선+최근수정순). 취소된 마켓은 항상 맨 뒤"
 *         schema: { type: string, enum: [recruitEnd, region, eventDate, latest] }
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
router.get('/mine', authenticateToken, getMyMarket);

router.post(
  '/',
  authenticateToken,
  requireHost,
  validateMarketInput,
  createMarket,
);

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
 *       500:
 *         description: 서버 오류
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
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
// [수정] optionalAuth 부착 — 취소된 마켓을 주최자 본인에게만 보여주기 위해서입니다.
//   토큰이 없거나 틀려도 401 을 내지 않으므로 비로그인 조회는 그대로 동작합니다.
router.get('/:marketId', optionalAuth, getMarketDetail);
//router.get('/closed/:marketId', authenticateToken,marketClosed);
router.patch('/:marketId', authenticateToken, updateMarketStatus);
router.patch('/closed/:marketId', authenticateToken, deleteMarket);
/**
 * @swagger
 * /markets/{marketId}/cancel-preview:
 *   get:
 *     summary: 마켓 취소 미리보기 (주최자 본인)
 *     description: |
 *       마켓을 취소하면 누구에게 얼마를 환불해야 하는지 미리 계산합니다. **DB 를 바꾸지 않습니다.**
 *       화면에서 취소 버튼을 누르면 이 값을 모달로 보여주고, 확인을 받은 뒤에 실제 취소를 요청합니다.
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "refundCount / refundTotal / unpaidCount / sellerCount / byBoothType / items"
 *       403: { description: 본인 마켓이 아님 }
 *       404: { description: 존재하지 않는 마켓 }
 */
//router.get('/:marketId/cancel-preview', authenticateToken, getCancelPreview);

/**
 * @swagger
 * /markets/closed/{marketId}:
 *   patch:
 *     summary: 마켓 취소 (주최자 본인) — 전액 환불 + 신청자 알림
 *     description: |
 *       마켓을 취소 상태(isExpired=2)로 바꾸고, 결제 완료 건을 **전액 환불**한 뒤 신청자 전원에게 알립니다.
 *       환불 비율은 기간별 정책(refundPolicy)을 적용하지 않고 항상 100% 입니다.
 *       마켓 취소는 주최자 사정이라 판매자에게 책임이 없기 때문입니다.
 *
 *       결제 완료 건이 하나라도 있으면 `confirmRefund: true` 없이는 **409 CANCEL_CONFIRM_REQUIRED** 로 거부하고
 *       환불 예상 내역을 `data` 에 담아 돌려줍니다.
 *
 *       환불에 실패한 건이 있어도 마켓 취소는 진행합니다. (판매자에게 통보는 반드시 가야 하므로)
 *       실패 목록은 `data.failed` 로 반환되며, 신청자 목록의 「일괄 결제취소」로 재시도할 수 있습니다.
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
 *               confirmRefund:
 *                 type: boolean
 *                 description: "환불 금액을 확인했다는 표시. 결제 건이 있으면 필수"
 *               reason:
 *                 type: string
 *                 description: "환불 사유 (기본값: 주최자의 마켓 취소)"
 *     responses:
 *       200: { description: "취소 완료 — refundedCount / refundedTotal / failed / notifiedCount" }
 *       409: { description: "CANCEL_CONFIRM_REQUIRED — 환불 예상 내역을 data 로 반환" }
 *       403: { description: 본인 마켓이 아님 }
 */
router.patch('/closed/:marketId', authenticateToken, deleteMarket);

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
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(
  '/:marketId/applications',
  authenticateToken,
  getApplicationsByMarket,
);

export default router;
