// backend/controllers/marketController.js
// 마켓(공고) 관련 로직 - 조회는 담당 C, 등록/신청목록은 담당 D, 좌표 저장은 담당 E

import pool from '../config/db.js';
// [중복 부스 신청 안내] 신청자 목록에 "이 판매자가 이 마켓에 몇 칸"을 붙입니다.
import { attachDuplicateToMarketApplications, summarizeDuplicates } from '../utills/duplicateApplication.js';
// [주최자 마켓 옵션] 초과 신청 허용 / 중복 신청 허용 두 옵션의 해석·저장을 한 곳에서 처리합니다.
import { buildInsertOptions, buildUpdateOptions, describeSkippedOptions } from '../utills/marketOptions.js';
// [부스 종류] 마켓별 부스 종류(최대 3개)의 저장·조회를 한 곳에서 처리합니다.
import {
  normalizeBoothTypes, saveBoothTypes, attachBoothTypes, describeBoothTypeSave, boothTypePriceSql,
} from '../utills/boothTypes.js';
import { createNotification, createNotifications } from '../services/notificationService.js';

// GET /api/markets?region=&sort=latest|eventDate|priceLow&includeExpired=
export async function getMarketList(req, res) {
  const { region, sort } = req.query;
  const includeExpired = req.query.includeExpired === 'true';

  try {
    let sql = `
      SELECT m.*,
        u.nickname AS hostNickname,
        (SELECT COUNT(*) FROM applications a
          WHERE a.marketId = m.marketId
            AND a.status IN ('Pending', 'Approved', 'Paid')
        ) AS appliedBooths
      FROM markets m
      JOIN users u ON u.userId = m.hostId
    `;
    // isExpired=2(주최자가 삭제함)인 마켓은 includeExpired 여부와 상관없이 항상 목록에서 제외합니다.
    const conditions = ['m.isExpired <> 2'];
    const values = [];

    if (!includeExpired) {
      conditions.push('m.isExpired = 0');
      conditions.push('m.eventDate_max >= CURDATE()'); // D-0(오늘)까지는 보이고, 다음 날부터 자동 제외
    }
    if (region) { conditions.push('m.region = ?'); values.push(region); }
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;

    if (sort === 'eventDate') {
      sql += ' ORDER BY m.eventDate_min ASC';
    } else if (sort === 'priceLow') {
      sql += ' ORDER BY m.boothPrice ASC';
    } else {
      sql += ' ORDER BY m.marketId DESC';
    }

    const [rows] = await pool.query(sql, values);
    // [부스 종류] 메인 화면 카드에 종류별 가격을 보여주기 위해 한 번의 IN 쿼리로 붙입니다.
    await attachBoothTypes(pool, rows);
    return res.status(200).json({ success: true, data: rows, message: '마켓 목록을 조회했습니다.' });
  } catch (error) {
    console.error('마켓 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 목록 조회에 실패했습니다.' });
  }
}

// GET /api/markets/:marketId
export async function getMarketDetail(req, res) {
  const { marketId } = req.params;

  try {
    // isExpired=2(주최자가 삭제함)인 마켓은 삭제된 것처럼 조회되지 않도록 제외합니다.
    // [수정] 상세 화면에 주최자 닉네임을 노출하기 위해 users 를 조인합니다.
    const [rows] = await pool.query(
      `SELECT m.*, u.nickname AS hostNickname
       FROM markets m
       JOIN users u ON u.userId = m.hostId
       WHERE m.marketId = ? AND m.isExpired <> 2`,
      [marketId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    // [부스 종류] 상세·수정·신청 화면이 모두 이 응답을 씁니다.
    //   「신규 신청 중단」된 종류까지 내려보냅니다. 주최자가 수정 화면에서 다시 켤 수 있어야 하고,
    //   판매자 화면(select)과 메인 카드는 isActive 로 걸러서 그립니다.
    await attachBoothTypes(pool, rows, { includeInactive: true });
    return res.status(200).json({ success: true, data: rows[0], message: '마켓 상세 정보를 조회했습니다.' });
  } catch (error) {
    console.error('마켓 상세 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 상세 조회에 실패했습니다.' });
  }
}

// POST /api/markets (로그인 필요, 주최자)
export async function createMarket(req, res) {
  const { userId } = req.user;
  // [수정] allowOvercapacity / allowDuplicateApplication 은 개별 변수로 받지 않고
  //        utills/marketOptions.js 가 req.body 에서 통째로 해석합니다. (수정 화면과 동일한 규칙)
  const { title, description, marketImage, locationName, region, latitude, longitude, eventDate_min, eventDate_max, boothPrice, isExpired, maxparticipants, recruitmentDate_min, recruitmentDate_max } = req.body;
  //console.log(req.body);

  if (!title || !eventDate_min || !eventDate_max || !locationName) {
    return res.status(400).json({ success: false, data: null, message: '마켓 이름, 개최 일자, 장소는 필수입니다.' });
  }
  if (new Date(eventDate_max) < new Date(eventDate_min)) {
    return res.status(400).json({ success: false, data: null, message: '종료일은 시작일보다 빠를 수 없습니다.' });
  }
  if (new Date(eventDate_max) < new Date(recruitmentDate_min)) {
    return res.status(400).json({ success: false, data: null, message: '모집일은 개최일보다 빠를 수 없습니다.' });
  }
  if (boothPrice !== undefined && (Number.isNaN(Number(boothPrice)) || Number(boothPrice) < 0)) {
    return res.status(400).json({ success: false, data: null, message: '부스료는 0 이상의 숫자여야 합니다.' });
  }
  if (maxparticipants !== undefined && maxparticipants !== null &&
    (!Number.isInteger(Number(maxparticipants)) || Number(maxparticipants) < 0)) {
    return res.status(400).json({ success: false, data: null, message: '최대 부스 수는 0 이상의 정수여야 합니다.' });
  }

  // [부스 종류] INSERT 전에 먼저 검사합니다. 마켓만 만들어지고 종류 저장이 실패하면
  //            주최자 입장에서 "등록은 됐는데 가격은 없는" 어정쩡한 마켓이 남기 때문입니다.
  const boothTypes = normalizeBoothTypes(req.body.boothTypes);
  if (!boothTypes.ok) {
    return res.status(400).json({ success: false, data: null, message: boothTypes.message });
  }

  try {
    // [추가] 부스 신청 옵션 두 가지를 등록 시점부터 반영합니다.
    //   - allowOvercapacity         : 예전에는 INSERT 에서 아예 빠져 있어, 새 마켓은 항상 0(불가)이었고
    //                                 수정 화면에 다시 들어가야만 켤 수 있었습니다.
    //   - allowDuplicateApplication : 값이 안 오면 기존 동작과 동일하게 허용(1).
    // 컬럼이 아직 없는 DB에서는 해당 컬럼만 빼고 INSERT 하므로 마켓 등록이 500 으로 죽지 않습니다.
    const options = await buildInsertOptions(pool, req.body);

    const baseColumns = [
      'hostId', 'title', 'description', 'marketImage', 'locationName', 'region',
      'latitude', 'longitude', 'eventDate_min', 'eventDate_max', 'boothPrice',
      'isExpired', 'maxparticipants', 'recruitmentDate_min', 'recruitmentDate_max',
    ];
    const baseValues = [
      userId, title, description || '', marketImage || null, locationName, region || null,
      latitude || 0, longitude || 0, eventDate_min, eventDate_max, boothPrice || 0,
      isExpired || 0, maxparticipants || 1, recruitmentDate_min, recruitmentDate_max,
    ];

    const columns = [...baseColumns, ...options.columns];
    const values = [...baseValues, ...options.values];
    const placeholders = columns.map(() => '?').join(', ');

    const [result] = await pool.query(
      `INSERT INTO markets (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    const notice = describeSkippedOptions(options.skipped);

    // [부스 종류] 등록 화면에서 「부스 추가」로 만든 종류를 저장합니다. (최대 3개)
    //   종류를 하나도 안 만들면 기존과 똑같은 단일가 마켓이 됩니다.
    let boothTypeNotice = '';
    if (boothTypes.list && boothTypes.list.length > 0) {
      const saveResult = await saveBoothTypes(pool, result.insertId, boothTypes.list);
      if (saveResult.skipped) boothTypeNotice = describeBoothTypeSave(saveResult);
    }

    return res.status(201).json({
      success: true,
      data: {
        marketId: result.insertId,
        options: options.applied,
        optionsSkipped: options.skipped,
        boothTypeCount: boothTypes.list ? boothTypes.list.length : 0,
      },
      message: `마켓이 등록되었습니다.${notice ? ' ' + notice : ''}${boothTypeNotice ? ' ' + boothTypeNotice : ''}`,
    });
  } catch (error) {
    console.error('마켓 등록 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 등록에 실패했습니다.' });
  }
}

// PATCH /api/markets/:marketId (로그인 필요, 마켓 주최자 본인만) - 마감 처리 등 상태 변경
export async function updateMarketStatus(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;
  const {
    isExpired, title, description,
    eventDate_min, eventDate_max,
    recruitmentDate_min, recruitmentDate_max,
    boothPrice, locationName, region,
    latitude, longitude, maxParticipants,
    marketImage
  } = req.body;
  // allowOvercapacity / allowDuplicateApplication 은 marketOptions 가 req.body 에서 직접 읽습니다.

  try {
    const [rows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(rows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 수정할 수 있습니다.' });
    }

    const fields = [];
    const values = [];

    if (isExpired !== undefined) { fields.push('isExpired = ?'); values.push(isExpired ? 1 : 0); }
    if (title) { fields.push('title = ?'); values.push(title); }
    if (description) { fields.push('description = ?'); values.push(description); }
    if (eventDate_min) { fields.push('eventDate_min = ?'); values.push(eventDate_min); }
    if (eventDate_max) { fields.push('eventDate_max = ?'); values.push(eventDate_max); }
    if (recruitmentDate_min) { fields.push('recruitmentDate_min = ?'); values.push(recruitmentDate_min); }
    if (recruitmentDate_max) { fields.push('recruitmentDate_max = ?'); values.push(recruitmentDate_max); }
    if (boothPrice !== undefined) { fields.push('boothPrice = ?'); values.push(boothPrice); }
    if (locationName) { fields.push('locationName = ?'); values.push(locationName); }
    if (region) { fields.push('region = ?'); values.push(region); }
    if (latitude !== undefined) { fields.push('latitude = ?'); values.push(latitude); }
    if (longitude !== undefined) { fields.push('longitude = ?'); values.push(longitude); }
    if (maxParticipants !== undefined) { fields.push('maxParticipants = ?'); values.push(maxParticipants); }
    // [수정] 부스 신청 옵션 두 가지(초과 신청 허용 / 중복 신청 허용)는 marketOptions 가 처리합니다.
    //   - 컬럼이 없는 DB에서는 그 옵션만 건너뛰고 나머지 수정은 정상 저장합니다.
    //     (예전에는 UPDATE 문에 컬럼명이 그대로 들어가 마켓 수정 전체가 500 으로 실패했습니다.)
    //   - 체크 해제(false)도 "보낸 값"이므로 0 으로 저장됩니다.
    const options = await buildUpdateOptions(pool, req.body);
    fields.push(...options.fields);
    values.push(...options.values);

    // [부스 종류] 수정 화면에서 보낸 목록과 DB 를 똑같이 맞춥니다.
    //   boothTypes 를 아예 안 보내면(다른 화면에서 온 PATCH) 기존 종류를 건드리지 않습니다.
    const boothTypes = normalizeBoothTypes(req.body.boothTypes);
    if (!boothTypes.ok) {
      return res.status(400).json({ success: false, data: null, message: boothTypes.message });
    }
    let boothTypeResult = null;
    if (boothTypes.list !== null) {
      boothTypeResult = await saveBoothTypes(pool, marketId, boothTypes.list);

      // [삭제 차단] 신청자가 있는 종류를 지우려 한 경우 — 마켓의 다른 항목도 저장하지 않고 되돌립니다.
      //   일부만 저장되면 주최자가 "뭐가 반영됐는지" 알 수 없게 됩니다.
      if (boothTypeResult.ok === false) {
        return res.status(boothTypeResult.status || 409).json({
          success: false,
          data: null,
          code: boothTypeResult.code,
          message: boothTypeResult.message,
        });
      }
    }
    const boothTypeNotice = boothTypeResult ? describeBoothTypeSave(boothTypeResult) : '';
    // [수정] 예전에는 `if (marketImage)` 라서 null/'' 이 무시됐고, 이미지 삭제가 불가능했습니다.
    if (marketImage !== undefined) { fields.push('marketImage = ?'); values.push(marketImage || null); }

    if (fields.length === 0) {
      // 부스 종류만 바꾸는 저장도 정상 케이스입니다. (제목·날짜는 그대로 두고 가격표만 손보는 경우)
      if (boothTypeResult) {
        return res.status(200).json({
          success: true,
          data: {
            options: options.applied,
            optionsSkipped: options.skipped,
            boothTypes: boothTypeResult,
          },
          message: `부스 종류가 저장되었습니다.${boothTypeNotice ? ' ' + boothTypeNotice : ''}`,
        });
      }
      const notice0 = describeSkippedOptions(options.skipped);
      return res.status(400).json({
        success: false,
        data: { optionsSkipped: options.skipped },
        message: notice0 || '수정할 내용이 없습니다.',
      });
    }

    values.push(marketId);
    await pool.query(`UPDATE markets SET ${fields.join(', ')} WHERE marketId = ?`, values);

    const notice = describeSkippedOptions(options.skipped);

    return res.status(200).json({
      success: true,
      data: {
        options: options.applied,
        optionsSkipped: options.skipped,
        boothTypes: boothTypeResult,
      },
      message: `마켓 정보가 수정되었습니다.${notice ? ' ' + notice : ''}${boothTypeNotice ? ' ' + boothTypeNotice : ''}`,
    });
  } catch (error) {
    console.error('마켓 상태 수정 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 수정에 실패했습니다.' });
  }
}

// PATCH /api/markets/:marketId/location (로그인 필요, 담당 E - 지도 좌표 저장)
export async function updateMarketLocation(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;
  const { latitude, longitude, locationName } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, data: null, message: '위도(latitude)와 경도(longitude)는 필수입니다.' });
  }

  try {
    const [rows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(rows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 수정할 수 있습니다.' });
    }

    await pool.query(
      `UPDATE markets SET latitude = ?, longitude = ?${locationName ? ', locationName = ?' : ''} WHERE marketId = ?`,
      locationName ? [latitude, longitude, locationName, marketId] : [latitude, longitude, marketId]
    );

    return res.status(200).json({ success: true, data: { latitude, longitude }, message: '마켓 좌표가 저장되었습니다.' });
  } catch (error) {
    console.error('마켓 좌표 저장 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 좌표 저장에 실패했습니다.' });
  }
}

// GET /api/markets/:marketId/applications (로그인 필요, 담당 D - 마켓 주최자용 신청 목록)
export async function getApplicationsByMarket(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;

  try {
    const [myData] = await pool.query('SELECT userType FROM users WHERE userId = ?', [userId]);
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (myData.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 유저 정보를 찾을 수 없습니다.' });
    }
    if (myData[0]?.userType === 1) {
      if (marketRows.length === 0) {
        return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
      }
      if (Number(marketRows[0].hostId) !== Number(userId)) {
        return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓의 신청 목록만 조회할 수 있습니다.' });
      }

      // 수정 — 평가하기 버튼 표시에 필요한 정보(행사 시작 여부/결제여부/이미 평가했는지) 같이 내려줌
      // [부스 종류] 주최자가 신청자별로 어떤 종류(A/B/C)를 골랐고 얼마를 받게 되는지 봐야 합니다.
      const bt = await boothTypePriceSql(pool, { app: 'a', market: 'm', type: 'bt' });

      const [rows] = await pool.query(
        // [닉네임] 신청자 목록에 sellerId(숫자)만 내려가서 화면에 "신청자: 12"처럼 보였습니다.
        //          users 를 조인해 sellerNickname 을 같이 내려줍니다.
        `SELECT a.*,
          su.nickname AS sellerNickname,
          ${bt.nameExpr} AS boothTypeName,
          ${bt.priceExpr} AS boothPrice,
          (m.eventDate_min <= CURDATE()) AS eventStarted,
          EXISTS(
            SELECT 1 FROM payments p WHERE p.applicationId = a.applicationId AND p.status = 'Paid'
          ) AS isPaid,
          sr.rating AS mySellerRating
        FROM applications a
        JOIN markets m ON m.marketId = a.marketId
        ${bt.join}
        LEFT JOIN users su ON su.userId = a.sellerId
        LEFT JOIN seller_reviews sr ON sr.applicationId = a.applicationId
        WHERE a.marketId = ?
        ORDER BY a.applicationId DESC`,
        [marketId]
      );

      // [중복 부스 신청 안내] 한 판매자가 이 마켓에서 부스를 몇 칸 잡고 있는지 각 행에 붙입니다.
      //   목록 전체를 이미 들고 있으므로 추가 쿼리 없이 배열 안에서 셉니다.
      //   화면(market.js)은 sellerDuplicateCount 로 "중복 N" 배지를 그립니다.
      const withDuplicate = attachDuplicateToMarketApplications(rows);
      const duplicateSummary = summarizeDuplicates(withDuplicate);

      // [부스 종류 현황] 주최자가 "A는 몇 명, B는 몇 명"을 한눈에 보게 집계합니다.
      //   목록을 이미 들고 있으므로 추가 쿼리 없이 배열에서 셉니다.
      //   정원 대비 현황은 "자리를 점유한" 상태(대기/승인/결제완료)만 셉니다.
      //   반려·환불·취소 건까지 세면 실제 남은 자리를 잘못 알려주게 됩니다.
      const OCCUPYING = ['Pending', 'Approved', 'Paid'];
      const typeMap = new Map();
      let occupiedTotal = 0;

      for (const r of withDuplicate) {
        const occupying = OCCUPYING.includes(r.status);
        if (occupying) occupiedTotal += 1;

        // 종류를 안 쓰는 마켓이거나 종류 지정 전 신청은 '기본'으로 묶습니다.
        const key = r.boothTypeName || '기본';
        if (!typeMap.has(key)) {
          typeMap.set(key, {
            boothTypeName: key, total: 0, occupied: 0,
            pending: 0, approved: 0, paid: 0, rejected: 0,
            amount: 0,
          });
        }
        const g = typeMap.get(key);
        g.total += 1;
        if (occupying) {
          g.occupied += 1;
          g.amount += Number(r.boothPrice) || 0;
        }
        if (r.status === 'Pending') g.pending += 1;
        else if (r.status === 'Approved') g.approved += 1;
        else if (r.status === 'Paid') g.paid += 1;
        else if (r.status === 'Rejected') g.rejected += 1;
      }

      // A → B → C → 기본 순으로 정렬 (화면 표기 순서와 맞춥니다)
      const order = { A: 0, B: 1, C: 2 };
      const boothTypeSummary = [...typeMap.values()].sort(
        (x, y) => (order[x.boothTypeName] ?? 9) - (order[y.boothTypeName] ?? 9)
      );

      // 정원은 대소문자 표기가 환경마다 달라 두 가지를 모두 받습니다.
      const [capRows] = await pool.query(
        'SELECT * FROM markets WHERE marketId = ?', [marketId]
      );
      const capRow = capRows[0] || {};
      const capacity = Number(capRow.maxParticipants ?? capRow.maxparticipants ?? 0);

      return res.status(200).json({
        success: true,
        data: withDuplicate,
        duplicateSummary,
        boothTypeSummary,
        capacity: Number.isFinite(capacity) ? capacity : 0,
        occupiedCount: occupiedTotal,
        message: '신청 목록을 조회했습니다.',
      });
    }

    // [단방향 전환 규칙 검증 - 버그 수정]
    //   판매자(userType 0)일 때 아무 응답도 만들지 않고 함수가 끝나서,
    //   요청이 응답을 못 받고 브라우저에서 계속 매달려 있었습니다. (타임아웃까지 대기)
    //   이 API 는 주최자 전용이므로 명시적으로 403 을 돌려줍니다.
    //   (app.use(hostAreaGuard) 에서도 막히지만, 컨트롤러 단독 호출 시를 대비한 이중 방어입니다.)
    return res.status(403).json({
      success: false,
      data: null,
      message: '판매자 계정은 주최자 기능을 이용할 수 없습니다.',
    });
  } catch (error) {
    console.error('신청 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 신청 목록 조회에 실패했습니다.' });
  }
}

// ── [추가] 부스 관리: 드래그 앤 드롭 부스 배치 ──────────────────────────────
// 행사 장소 도면 위에서 부스 구역을 드래그하여 배치하는 기능.
// booth_layouts 테이블에 (marketId, applicationId)별 좌표를 저장합니다.
// 필요한 테이블/컬럼은 scripts/migrate-add-booth-layout-settlement-queue.js 로 생성합니다.

// GET /api/markets/:marketId/layout (공개 - 판매자/주최자 누구나 배치도를 볼 수 있어야 함)
export async function getBoothLayout(req, res) {
  const { marketId } = req.params;

  try {
    const [marketRows] = await pool.query('SELECT marketId FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }

    const [rows] = await pool.query(
      `SELECT a.applicationId, a.boothNumber, a.itemName, a.status,
              a.sellerId, su.nickname AS sellerNickname,
              bl.positionX AS positionX, bl.positionY AS positionY
       FROM applications a
       LEFT JOIN users su ON su.userId = a.sellerId
       LEFT JOIN booth_layouts bl ON bl.applicationId = a.applicationId AND bl.marketId = a.marketId
       WHERE a.marketId = ? AND a.status = 'Approved'
       ORDER BY a.applicationId ASC`,
      [marketId]
    );

    return res.status(200).json({ success: true, data: rows, message: '부스 배치 정보를 조회했습니다.' });
  } catch (error) {
    console.error('부스 배치 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 부스 배치 조회에 실패했습니다.' });
  }
}

// PUT /api/markets/:marketId/layout (로그인 필요, 마켓 주최자 본인만)
// body: { layout: [{ applicationId, positionX, positionY }, ...] } - 여러 부스 좌표를 한번에 저장(upsert)
export async function saveBoothLayout(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;
  const { layout } = req.body;

  if (!Array.isArray(layout) || layout.length === 0) {
    return res.status(400).json({ success: false, data: null, message: '저장할 배치 정보(layout)가 없습니다.' });
  }

  try {
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 배치를 저장할 수 있습니다.' });
    }

    let updatedCount = 0;
    for (const item of layout) {
      const { applicationId, positionX, positionY } = item || {};
      if (applicationId === undefined || positionX === undefined || positionY === undefined) continue;

      await pool.query(
        `INSERT INTO booth_layouts (marketId, applicationId, positionX, positionY)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE positionX = VALUES(positionX), positionY = VALUES(positionY)`,
        [marketId, applicationId, positionX, positionY]
      );
      updatedCount += 1;
    }

    return res.status(200).json({
      success: true,
      data: { marketId: Number(marketId), updatedCount },
      message: '부스 배치가 저장되었습니다.',
    });
  } catch (error) {
    console.error('부스 배치 저장 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 부스 배치 저장에 실패했습니다.' });
  }
}

// ── [추가] 정산 관리 ────────────────────────────────────────────────────
// 참가 승인된 셀러들의 부스 대여료 결제 상태를 확인하고, 최종 정산 금액을 통보합니다.

// GET /api/markets/:marketId/settlement (로그인 필요, 마켓 주최자 본인만)
export async function getSettlementSummary(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;

  try {
    const [marketRows] = await pool.query('SELECT hostId, settlementNotifiedAt FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓의 정산만 조회할 수 있습니다.' });
    }

    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.boothNumber, a.itemName, m.boothPrice,
              p.status AS paymentStatus, p.paidAt
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       LEFT JOIN payments p ON p.applicationId = a.applicationId
       WHERE a.marketId = ? AND a.status = 'Approved'
       ORDER BY a.applicationId ASC`,
      [marketId]
    );

    const items = rows.map((r) => ({
      applicationId: r.applicationId,
      sellerId: r.sellerId,
      boothNumber: r.boothNumber,
      itemName: r.itemName,
      boothPrice: r.boothPrice,
      paymentStatus: r.paymentStatus === 'Paid' ? 'Paid' : 'Unpaid',
      paidAt: r.paidAt || null,
    }));

    const paidCount = items.filter((i) => i.paymentStatus === 'Paid').length;
    const totalSettlementAmount = items
      .filter((i) => i.paymentStatus === 'Paid')
      .reduce((sum, i) => sum + (i.boothPrice || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        marketId: Number(marketId),
        totalBoothCount: items.length,
        paidCount,
        unpaidCount: items.length - paidCount,
        totalSettlementAmount,
        settlementNotifiedAt: marketRows[0].settlementNotifiedAt || null,
        items,
      },
      message: '정산 현황을 조회했습니다.',
    });
  } catch (error) {
    console.error('정산 현황 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 정산 현황 조회에 실패했습니다.' });
  }
}

// PATCH /api/markets/:marketId/settlement/notify (로그인 필요, 마켓 주최자 본인만)
// 최종 정산 금액을 확정하고 셀러들에게 통보 처리했음을 기록합니다. (실제 알림 발송은 3주 일정상 제외, DB 기록만 수행)
export async function notifySettlement(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;

  try {
    const [marketRows] = await pool.query('SELECT hostId, title FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 정산을 통보할 수 있습니다.' });
    }

    await pool.query('UPDATE markets SET settlementNotifiedAt = NOW() WHERE marketId = ?', [marketId]);
    const [rows] = await pool.query('SELECT settlementNotifiedAt FROM markets WHERE marketId = ?', [marketId]);

    // [추가] 정산 통보 -> 결제 완료(Paid)한 셀러 전원에게 알림
    const [paidSellers] = await pool.query(
      `SELECT DISTINCT a.sellerId
       FROM applications a
       JOIN payments p ON p.applicationId = a.applicationId
       WHERE a.marketId = ? AND p.status = 'Paid'`,
      [marketId]
    );
    if (paidSellers.length > 0) {
      await createNotifications(
        paidSellers.map((row) => ({
          userId: row.sellerId,
          audience: 'seller',
          type: 'settlement_notified',
          title: '정산 금액 통보',
          message: `"${marketRows[0].title}" 마켓의 정산 금액이 확정되어 통보되었습니다. 내 부스 관리에서 확인해 주세요.`,
          marketId: Number(marketId),
        }))
      );
    }

    return res.status(200).json({
      success: true,
      data: { marketId: Number(marketId), settlementNotifiedAt: rows[0].settlementNotifiedAt },
      message: '정산 금액을 통보했습니다.',
    });
  } catch (error) {
    console.error('정산 통보 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 정산 통보에 실패했습니다.' });
  }
}

// ── [추가] 결제 대기열 타임아웃 ───────────────────────────────────────────
// 승인 후 일정 시간(paymentDueAt) 내 미결제 시, 해당 신청을 Expired로 만료시키고
// 같은 부스에 대기 중이던 다음 Pending 신청을 자동으로 Approved 승격합니다.
// 실제 서비스라면 스케줄러(cron)가 주기적으로 호출하겠지만, 이 프로젝트는 3주 일정상
// 스케줄러 인프라 없이 주최자가 필요할 때(또는 관리용 배치 작업으로) 직접 호출하는 방식으로 구현합니다.

// GET /api/markets/:marketId/booths/:boothNumber/queue (로그인 필요, 마켓 주최자 본인만)
export async function getBoothQueue(req, res) {
  const { userId } = req.user;
  const { marketId, boothNumber } = req.params;

  try {
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓의 대기열만 조회할 수 있습니다.' });
    }

    const [rows] = await pool.query(
      `SELECT applicationId, sellerId, itemName, status, paymentDueAt
       FROM applications
       WHERE marketId = ? AND boothNumber = ? AND status IN ('Pending', 'Approved')
       ORDER BY applicationId ASC`,
      [marketId, boothNumber]
    );

    return res.status(200).json({
      success: true,
      data: { marketId: Number(marketId), boothNumber, queue: rows },
      message: '부스 대기열을 조회했습니다.',
    });
  } catch (error) {
    console.error('부스 대기열 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 대기열 조회에 실패했습니다.' });
  }
}

// POST /api/markets/:marketId/queue/process-timeouts (로그인 필요, 마켓 주최자 본인만)
// body: { paymentWindowMinutes? } - 새로 승인되는 다음 대기자에게 부여할 결제 기한(분), 기본 1440분(24시간)
export async function processQueueTimeouts(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;
  const paymentWindowMinutes = Number(req.body?.paymentWindowMinutes) || 1440;

  try {
    const [marketRows] = await pool.query('SELECT hostId, title FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 처리할 수 있습니다.' });
    }
    const marketTitle = marketRows[0].title;

    // 결제 기한이 지났는데 아직 결제(payments.status='Paid')가 안 된 승인 건들을 찾음
    const [overdue] = await pool.query(
      `SELECT a.applicationId, a.boothNumber, a.sellerId, a.itemName
       FROM applications a
       LEFT JOIN payments p ON p.applicationId = a.applicationId AND p.status = 'Paid'
       WHERE a.marketId = ? AND a.status = 'Approved' AND a.paymentDueAt IS NOT NULL
         AND a.paymentDueAt < NOW() AND p.paymentId IS NULL`,
      [marketId]
    );

    const expired = [];
    const approved = [];

    for (const row of overdue) {
      await pool.query(
        `UPDATE applications SET status = 'Expired', paymentDueAt = NULL WHERE applicationId = ?`,
        [row.applicationId]
      );
      expired.push({ applicationId: row.applicationId, boothNumber: row.boothNumber });

      // [추가] 결제 기한 만료 -> 판매자에게 알림
      await createNotification({
        userId: row.sellerId,
        audience: 'seller',
        type: 'application_expired',
        title: '결제 기한 만료',
        message: `"${marketTitle}" 마켓 ${row.boothNumber}번 부스(${row.itemName}) 신청이 결제 기한을 넘겨 만료되었습니다.`,
        marketId: Number(marketId),
        applicationId: row.applicationId,
      });

      const [nextRows] = await pool.query(
        `SELECT applicationId, sellerId, itemName FROM applications
         WHERE marketId = ? AND boothNumber = ? AND status = 'Pending'
         ORDER BY applicationId ASC LIMIT 1`,
        [marketId, row.boothNumber]
      );

      if (nextRows.length > 0) {
        const nextId = nextRows[0].applicationId;
        await pool.query(
          `UPDATE applications SET status = 'Approved', paymentDueAt = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE applicationId = ?`,
          [paymentWindowMinutes, nextId]
        );
        approved.push({ applicationId: nextId, boothNumber: row.boothNumber });

        // [추가] 대기열 자동 승인 -> 다음 순번 판매자에게 알림
        await createNotification({
          userId: nextRows[0].sellerId,
          audience: 'seller',
          type: 'application_auto_approved',
          title: '부스 신청 자동 승인',
          message: `"${marketTitle}" 마켓 ${row.boothNumber}번 부스(${nextRows[0].itemName}) 신청이 앞 순번 취소로 자동 승인되었습니다. 기한 내에 결제를 완료해 주세요.`,
          marketId: Number(marketId),
          applicationId: nextId,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        marketId: Number(marketId),
        expiredCount: expired.length,
        expired,
        newlyApprovedCount: approved.length,
        approved,
      },
      message: '결제 대기열 타임아웃 처리가 완료되었습니다.',
    });
  } catch (error) {
    console.error('결제 대기열 처리 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 대기열 처리에 실패했습니다.' });
  }
}

// [추가 07-28] H-02 주최자 마켓 목록 정렬 필터
// 메인 목록(getMarketList) / 검색(searchController) 과 동일하게
// 고정된 SQL 조각만 매핑에서 골라 쓰므로 sort 값이 그대로 쿼리에 들어가지 않음 (인젝션 안전).
//   - recruitEnd : 모집마감순  (모집 마감일이 가까운 순, 마감일 없는 마켓은 뒤로)
//   - region     : 지역순      (같은 지역 안에서는 개최일이 빠른 순)
//   - eventDate  : 개최순      (개최일이 가까운 순, 개최일 없는 마켓은 뒤로)
//   - latest     : 기본값      (기존 동작 = 진행중 우선 + 최근 수정순)
const MY_MARKET_SORT_CLAUSES = {
  recruitEnd: 'm.recruitmentDate_max IS NULL ASC, m.recruitmentDate_max ASC, m.marketId DESC',
  region: 'm.region ASC, m.eventDate_min ASC, m.marketId DESC',
  eventDate: 'm.eventDate_min IS NULL ASC, m.eventDate_min ASC, m.marketId DESC',
  latest: 'm.isExpired ASC, m.updated_at DESC',
};

// GET /api/markets/mine?includeExpired=&sort=recruitEnd|region|eventDate|latest
// [통합] 기존 /api/my-markets (myMarketController.getMyMarkets) 와 기능이 중복되어
//        이 함수 하나로 합쳤습니다. includeExpired 옵션은 구 my-markets 스펙에서 흡수.
//        - 기본값: 모집중/마감/취소 전부 반환 (프론트 상태 필터가 클라이언트에서 동작)
//        - includeExpired=false: 모집중(isExpired=0)만 반환
export async function getMyMarket(req, res) {
  const { userId } = req.user;
  const includeExpired = req.query.includeExpired !== 'false';

  // 정렬 옵션이 없거나 정의되지 않은 값이면 기존 기본 정렬(latest)을 사용
  const { sort } = req.query;
  const sortClause = MY_MARKET_SORT_CLAUSES[sort] || MY_MARKET_SORT_CLAUSES.latest;
  // 취소된 마켓(isExpired=2)은 어떤 정렬을 골라도 항상 목록 맨 아래로 내림
  const orderClause = sort && sort !== 'latest'
    ? `(m.isExpired = 2) ASC, ${sortClause}`
    : sortClause;

  try {
    const [rows] = await pool.query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId
              AND a.status IN ('Pending', 'Approved', 'Paid')
         ) AS appliedBooths,
         -- [추가] 결제 현황 게이지용: 판매자별 결제 진행 상태 집계
         --   결제완료 = 'Paid', 결제대기 = 'Approved'(승인은 됐지만 아직 결제 전),
         --   환불완료 = 'Refunded' + 'RefundRequested'(환불 승인 완료 및 환불 진행중 건 포함)
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status = 'Paid'
         ) AS paidBooths,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status = 'Approved'
         ) AS pendingPaymentBooths,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status IN ('Refunded', 'RefundRequested')
         ) AS refundedBooths,
         -- [추가] 승인 현황 게이지용: 판매자 신청건의 승인 진행 상태 집계
         --   승인대기 = 'Pending', 반려 = 'Rejected',
         --   승인됨 = 승인을 한 번이라도 통과한 건 전체
         --           ('Approved'/'Paid'/'Refunded'/'RefundRequested'/'Expired')
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status = 'Pending'
         ) AS pendingApprovalBooths,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId
              AND a.status IN ('Approved', 'Paid', 'Refunded', 'RefundRequested', 'Expired')
         ) AS approvedBooths,
         (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId AND a.status = 'Rejected'
         ) AS rejectedBooths
       FROM markets m
       WHERE m.hostId = ?
         ${includeExpired ? '' : 'AND m.isExpired = 0'}
       ORDER BY ${orderClause}`,
      [userId]
    );

    // [부스 종류] 주최자 마켓 목록 카드에도 종류별 가격을 보여줍니다.
    await attachBoothTypes(pool, rows);
    // 밑에 코드는 참여자 수 까지 가져오는 코드지만 아직 applications db가 완성 되지 않아 보류
    // const [rows] = await pool.query(
    //   `select 
    //     m.*,
    //   (select count(*) from applications a where a.marketId = m.marketId) as applicantCount
    //   from markets  m
    //   where m.hostId= ?
    //   order by marketId desc`, [userId]
    // );
    return res.status(200).json({
      success: true,
      data: rows,
      message: '내 마켓 목록 조회'
    });
  }
  catch (error) {
    console.error('조회 실패');
    return res.status(500).json({ success: false, data: null, message: '서버 오류' })
  }
}
