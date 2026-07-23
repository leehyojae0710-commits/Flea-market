// backend/controllers/marketController.js
// 마켓(공고) 관련 로직 - 조회는 담당 C, 등록/신청목록은 담당 D, 좌표 저장은 담당 E

import pool from '../config/db.js';

// GET /api/markets?region=&sort=latest|eventDate&includeExpired=
export async function getMarketList(req, res) {
  const { region, sort } = req.query;
  const includeExpired = req.query.includeExpired === 'true';

  try {
    let sql = `
      SELECT m.*
      FROM markets m
      JOIN users u ON u.userId = m.hostId
    `;
    const conditions = [];
    const values = [];

    if (!includeExpired) {
      conditions.push('m.isExpired = 0');
      conditions.push('m.eventDate_max >= CURDATE()'); // D-0(오늘)까지는 보이고, 다음 날부터 자동 제외
    }
    if (region) { conditions.push('m.region = ?'); values.push(region); }
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;

    sql += sort === 'eventDate' ? ' ORDER BY m.eventDate_min ASC' : ' ORDER BY m.marketId DESC';

    const [rows] = await pool.query(sql, values);
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
    const [rows] = await pool.query('SELECT * FROM markets WHERE marketId = ?', [marketId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    return res.status(200).json({ success: true, data: rows[0], message: '마켓 상세 정보를 조회했습니다.' });
  } catch (error) {
    console.error('마켓 상세 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 상세 조회에 실패했습니다.' });
  }
}

// POST /api/markets (로그인 필요, 주최자)
export async function createMarket(req, res) {
  const { userId } = req.user;
  const { title, description, marketImage, locationName, region, latitude, longitude, eventDate_min, eventDate_max, boothPrice, isExpired, maxparticipants, recruitmentDate_min, recruitmentDate_max } = req.body;
  console.log(req.body);

  if (!title || !eventDate_min || !eventDate_max || !locationName) {
    return res.status(400).json({ success: false, data: null, message: '마켓 이름, 개최 일자, 장소는 필수입니다.' });
  }
  if (new Date(eventDate_max) < new Date(eventDate_min)) {
    return res.status(400).json({ success: false, data: null, message: '종료일은 시작일보다 빠를 수 없습니다.' });
  }
  if(new Date(eventDate_max) < new Date(recruitmentDate_min))
  {
    return res.status(400).json({ success: false, data: null, message: '모집일은 개최일보다 빠를 수 없습니다.' });
  }
  if (boothPrice !== undefined && (Number.isNaN(Number(boothPrice)) || Number(boothPrice) < 0)) {
    return res.status(400).json({ success: false, data: null, message: '부스료는 0 이상의 숫자여야 합니다.' });
  }
  if (maxparticipants !== undefined && maxparticipants !== null &&
    (!Number.isInteger(Number(maxparticipants)) || Number(maxparticipants) < 0)) {
    return res.status(400).json({ success: false, data: null, message: '최대 부스 수는 0 이상의 정수여야 합니다.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO markets (hostId, title, description, marketImage, locationName, region, latitude, longitude, eventDate_min, eventDate_max, boothPrice, isExpired, maxparticipants,recruitmentDate_min,recruitmentDate_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)`,
      [userId, title, description || '', marketImage || null, locationName, region || null, latitude || 0, longitude || 0, eventDate_min, eventDate_max, boothPrice || 0, isExpired || 0, maxparticipants || 1, recruitmentDate_min, recruitmentDate_max]
    );

    console.log('req.body 전체:', req.body);

    return res.status(201).json({
      success: true,
      data: { marketId: result.insertId },
      message: '마켓이 등록되었습니다.',
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
    if (marketImage) { fields.push('marketImage = ?'); values.push(marketImage); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, data: null, message: '수정할 내용이 없습니다.' });
    }

    values.push(marketId);
    await pool.query(`UPDATE markets SET ${fields.join(', ')} WHERE marketId = ?`, values);

    return res.status(200).json({ success: true, data: null, message: '마켓 정보가 수정되었습니다.' });
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
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓의 신청 목록만 조회할 수 있습니다.' });
    }

    const [rows] = await pool.query('SELECT * FROM applications WHERE marketId = ? ORDER BY applicationId DESC', [marketId]);
    return res.status(200).json({ success: true, data: rows, message: '신청 목록을 조회했습니다.' });
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
              bl.positionX AS positionX, bl.positionY AS positionY
       FROM applications a
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
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 정산을 통보할 수 있습니다.' });
    }

    await pool.query('UPDATE markets SET settlementNotifiedAt = NOW() WHERE marketId = ?', [marketId]);
    const [rows] = await pool.query('SELECT settlementNotifiedAt FROM markets WHERE marketId = ?', [marketId]);

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
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 처리할 수 있습니다.' });
    }

    // 결제 기한이 지났는데 아직 결제(payments.status='Paid')가 안 된 승인 건들을 찾음
    const [overdue] = await pool.query(
      `SELECT a.applicationId, a.boothNumber
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

      const [nextRows] = await pool.query(
        `SELECT applicationId FROM applications
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

export async function getMyMarket(req, res) {
  const { userId } = req.user;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM markets WHERE hostId = ? ORDER BY marketId DESC',
      [userId]
    );
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
