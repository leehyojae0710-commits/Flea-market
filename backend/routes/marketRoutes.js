// backend/routes/marketRoutes.js
// 마켓(공고) 라우트 - 조회는 담당 C, 등록/신청목록은 담당 D, 좌표 저장은 담당 E
// [추가] 부스 배치(드래그 앤 드롭), 정산 관리, 결제 대기열 타임아웃
import express from 'express';
import {
  getMarketList,
  getMarketDetail,
  createMarket,
  updateMarketStatus,
  updateMarketLocation,
  getApplicationsByMarket,
  getBoothLayout,
  saveBoothLayout,
  getSettlementSummary,
  notifySettlement,
  getBoothQueue,
  processQueueTimeouts,
  getMyMarket,
} from '../controllers/marketController.js';
import { deleteMarket, getCancelPreview } from '../controllers/dbdeleteController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { requireHost } from '../middleware/hostOnlyMiddleware.js';
import { validateMarketInput } from '../middleware/marketValidationMiddleware.js';

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

/**
 * @swagger
 * /markets:
 *   post:
 *     summary: 마켓 등록 (로그인한 주최자만)
 *     description: |
 *       마켓을 새로 등록합니다. 부스 신청 옵션 2가지를 등록 시점부터 지정할 수 있습니다.
 *
 *       - `allowOvercapacity` (기본 false) : 정원(maxparticipants)이 차도 행사 시작일 전까지는
 *         초과 신청/승인/결제를 허용합니다. 행사가 시작되면 이 값이 true 여도 다시 막힙니다.
 *       - `allowDuplicateApplication` (기본 true) : 같은 판매자가 이 마켓에 부스를 여러 개
 *         신청할 수 있습니다. false 로 두면 판매자당 1건만 신청 가능합니다.
 *
 *       두 옵션은 markets 테이블 컬럼입니다. 마이그레이션(`node scripts/migrate-add-market-options.js`)을
 *       아직 실행하지 않은 DB 에서는 해당 옵션만 저장되지 않고 응답의 `data.optionsSkipped` 로 알려줍니다.
 *       (마켓 등록 자체는 정상 처리됩니다.)
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, eventDate_min, eventDate_max, locationName]
 *             properties:
 *               title: { type: string, maxLength: 100 }
 *               description: { type: string, maxLength: 2000 }
 *               locationName: { type: string }
 *               region: { type: string, nullable: true }
 *               latitude: { type: number }
 *               longitude: { type: number }
 *               eventDate_min: { type: string, format: date }
 *               eventDate_max: { type: string, format: date }
 *               recruitmentDate_min: { type: string, format: date }
 *               recruitmentDate_max: { type: string, format: date }
 *               boothPrice: { type: integer, minimum: 0 }
 *               maxparticipants: { type: integer, minimum: 0, description: "허용 최대 부스 수 (0 = 제한 없음)" }
 *               allowOvercapacity: { type: boolean, default: false, description: "정원 초과 신청 허용" }
 *               allowDuplicateApplication: { type: boolean, default: true, description: "같은 판매자의 중복 부스 신청 허용" }
 *               marketImage: { type: string, nullable: true }
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
 *                     data:
 *                       type: object
 *                       properties:
 *                         marketId: { type: integer }
 *                         options:
 *                           type: object
 *                           description: "실제로 저장된 옵션 값 (0/1)"
 *                         optionsSkipped:
 *                           type: array
 *                           description: "DB 컬럼이 없어 저장하지 못한 옵션 키 목록"
 *                           items: { type: string }
 *       400:
 *         description: 입력값 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: 주최자 계정이 아님
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
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
 *               eventDate_min: { type: string, format: date }
 *               eventDate_max: { type: string, format: date }
 *               recruitmentDate_min: { type: string, format: date }
 *               recruitmentDate_max: { type: string, format: date }
 *               boothPrice: { type: integer, minimum: 0 }
 *               maxParticipants: { type: integer, minimum: 0 }
 *               allowOvercapacity:
 *                 type: boolean
 *                 description: "정원 초과 신청 허용. 보내지 않으면 기존 값 유지, false 로 보내면 꺼집니다."
 *               allowDuplicateApplication:
 *                 type: boolean
 *                 description: "같은 판매자의 중복 부스 신청 허용. 보내지 않으면 기존 값 유지, false 로 보내면 판매자당 1건으로 제한됩니다."
 *               marketImage: { type: string, nullable: true, description: "null 이나 빈 문자열을 보내면 이미지 삭제" }
 *     responses:
 *       200:
 *         description: "수정 성공. data.options 에 저장된 옵션 값, data.optionsSkipped 에 DB 컬럼이 없어 저장하지 못한 옵션 키가 담깁니다."
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         options: { type: object, description: "실제로 저장된 옵션 값 (0/1)" }
 *                         optionsSkipped: { type: array, items: { type: string } }
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
router.get('/:marketId', getMarketDetail);
//router.get('/closed/:marketId', authenticateToken,marketClosed);
router.patch('/:marketId', authenticateToken, updateMarketStatus);
/**
 * @swagger
 * /markets/{marketId}/cancel-preview:
 *   get:
 *     summary: 마켓 취소 미리보기 (주최자 본인)
 *     description: |
 *       마켓을 취소하면 누구에게 얼마를 환불해야 하는지 미리 계산합니다. DB 를 바꾸지 않습니다.
 *       부스 종류(A/B/C)별 건수·금액과 총 환불 예상액, 결제 전 신청 건수를 함께 돌려줍니다.
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: "byBoothType(종류별 집계) / refundCount / refundTotal / unpaidCount / sellerCount / items"
 *       403: { description: 본인 마켓이 아님 }
 *       404: { description: 존재하지 않는 마켓 }
 */
router.get('/:marketId/cancel-preview', authenticateToken, getCancelPreview);

/**
 * @swagger
 * /markets/closed/{marketId}:
 *   patch:
 *     summary: 마켓 취소 (주최자 본인) — 전액 환불 + 신청자 알림
 *     description: |
 *       마켓을 취소 상태(isExpired=2)로 바꾸고, 결제 완료 건을 전액 환불한 뒤 신청자 전원에게 알립니다.
 *
 *       결제 완료 건이 하나라도 있으면 `confirmRefund: true` 없이는 **409 CANCEL_CONFIRM_REQUIRED** 로 거부하고
 *       환불 예상 내역을 `data` 에 담아 돌려줍니다. 금액을 확인시키지 않은 채 돈이 빠져나가는 것을 막기 위함입니다.
 *
 *       환불에 실패한 건이 있어도 마켓 취소는 진행합니다. (판매자에게 통보는 반드시 가야 하므로)
 *       실패 목록은 `data.failed` 로 반환되며, 결제 내역의 개별 환불로 재시도할 수 있습니다.
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
 *       200: { description: "취소 완료 — refundedCount / refundedTotal / failed / cancelledUnpaid / notifiedCount" }
 *       409: { description: "CANCEL_CONFIRM_REQUIRED — 환불 예상 내역을 data 로 반환" }
 *       403: { description: 본인 마켓이 아님 }
 */
router.patch('/closed/:marketId', authenticateToken, deleteMarket);
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
 *       500:
 *         description: 서버 오류
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

/**
 * @swagger
 * /markets/{marketId}/layout:
 *   get:
 *     summary: "[추가] 부스 배치도 조회 (승인된 부스 + 저장된 좌표)"
 *     description: >
 *       행사 장소 도면 위에서 드래그로 배치한 부스 좌표를 조회합니다. 아직 배치를 저장하지 않은 부스는
 *       positionX/positionY가 null로 내려옵니다. 판매자/주최자 누구나 조회 가능(공개 API)합니다.
 *     tags: [Markets]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 배치 정보
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/BoothLayoutData' }
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
 *   put:
 *     summary: "[추가] 부스 배치 저장 (드래그 앤 드롭, 주최자 본인만)"
 *     description: 여러 부스의 좌표를 한번에 저장(upsert)합니다. 기존에 저장된 좌표가 있으면 갱신됩니다.
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
 *             required: [layout]
 *             properties:
 *               layout:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/SaveBoothLayoutInputItem' }
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
 *                     data: { $ref: '#/components/schemas/SaveBoothLayoutData' }
 *       400:
 *         description: layout 배열 누락/비어있음
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
router.get('/:marketId/layout', getBoothLayout);
router.put('/:marketId/layout', authenticateToken, saveBoothLayout);

/**
 * @swagger
 * /markets/{marketId}/settlement:
 *   get:
 *     summary: "[추가] 정산 현황 조회 (주최자 본인만)"
 *     description: 승인된 부스들의 결제 상태(완료/미결제)와 결제 완료 금액 합계를 조회합니다.
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 정산 현황
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/SettlementData' }
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
router.get('/:marketId/settlement', authenticateToken, getSettlementSummary);

/**
 * @swagger
 * /markets/{marketId}/settlement/notify:
 *   patch:
 *     summary: "[추가] 최종 정산 금액 통보 처리 (주최자 본인만)"
 *     description: >
 *       정산을 확정하고 통보 시각(settlementNotifiedAt)을 기록합니다. 실제 알림 발송(문자/이메일 등)은
 *       3주 프로젝트 일정상 제외하고, 통보 처리 여부만 서버에 기록합니다.
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 통보 처리 완료
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/NotifySettlementData' }
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
router.patch(
  '/:marketId/settlement/notify',
  authenticateToken,
  notifySettlement,
);

/**
 * @swagger
 * /markets/{marketId}/booths/{boothNumber}/queue:
 *   get:
 *     summary: "[추가] 부스별 결제 대기열 조회 (주최자 본인만)"
 *     description: 특정 부스 번호에 대해 신청 순서(applicationId 오름차순)대로 대기열을 조회합니다.
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: boothNumber
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 대기열 목록
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/BoothQueueData' }
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
  '/:marketId/booths/:boothNumber/queue',
  authenticateToken,
  getBoothQueue,
);

/**
 * @swagger
 * /markets/{marketId}/queue/process-timeouts:
 *   post:
 *     summary: "[추가] 결제 대기열 타임아웃 일괄 처리 (주최자 본인만)"
 *     description: >
 *       결제 기한(paymentDueAt)이 지났는데 아직 결제하지 않은 승인 건을 Expired로 만료시키고,
 *       같은 부스에서 대기 중이던 다음 Pending 신청을 자동으로 Approved 승격합니다.
 *       실제 서비스에서는 스케줄러(cron)가 주기적으로 호출하도록 구성하는 것을 권장하며,
 *       현재 프로젝트는 3주 일정상 스케줄러 없이 주최자가 필요 시 직접 호출하는 방식입니다.
 *     tags: [Markets]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentWindowMinutes:
 *                 type: integer
 *                 description: 새로 승인되는 다음 대기자에게 부여할 결제 기한(분). 기본 1440분(24시간)
 *                 example: 1440
 *     responses:
 *       200:
 *         description: 처리 완료
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ProcessTimeoutsData' }
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
router.post(
  '/:marketId/queue/process-timeouts',
  authenticateToken,
  processQueueTimeouts,
);

export default router;
