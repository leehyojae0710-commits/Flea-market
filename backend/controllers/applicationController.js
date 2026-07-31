// backend/controllers/applicationController.js
// 담당 D: 부스 신청 / 승인 / 반려
// [추가] 판매자 본인의 신청 목록 조회 / 수정 / 취소(삭제)

import pool from '../config/db.js';
<<<<<<< HEAD
// [부스 신청 정합성] 신청 자격 판정은 utills/applicationPolicy.js 한 곳에서 합니다.
import { checkBoothApplyEligibility, toDateKey, todayKey } from '../utills/applicationPolicy.js';
=======
import { createNotification } from '../services/notificationService.js';
>>>>>>> origin/feat/이효재

// POST /api/applications (로그인 필요, 판매자)
export async function applyForBooth(req, res) {
  const { userId } = req.user;
  const { marketId, boothNumber, title, itemName, productDesc, itemImage } = req.body;

  if (!marketId || !boothNumber || !itemName) {
    return res.status(400).json({ success: false, data: null, message: '마켓, 부스 번호, 물품명은 필수입니다.' });
  }

  // [부스 신청 정합성] 검사와 INSERT 를 한 트랜잭션으로 묶습니다.
  //   두 사람이 같은 부스를 동시에 신청하면, 검사 시점에는 둘 다 "빈 부스"로 보이고
  //   INSERT 는 둘 다 성공해 버립니다. markets 행을 FOR UPDATE 로 잠가 마켓 단위로 줄을 세웁니다.
  const conn = await pool.getConnection();

  try {
<<<<<<< HEAD
    await conn.beginTransaction();

    const check = await checkBoothApplyEligibility(conn, {
      userId,
      marketId,
      boothNumber,
      lock: true,
    });

    if (!check.ok) {
      await conn.rollback();
      return res.status(check.status).json({
        success: false,
        data: null,
        code: check.code,
        message: check.message,
      });
=======
    const [marketRows] = await pool.query('SELECT marketId, isExpired, hostId, title FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (marketRows[0].isExpired) {
      return res.status(409).json({ success: false, data: null, message: '마감된 마켓에는 신청할 수 없습니다.' });
>>>>>>> origin/feat/이효재
    }

    const [result] = await conn.query(
      `INSERT INTO applications (marketId, sellerId, boothNumber, title, itemName, productDesc, itemImage, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [marketId, userId, boothNumber, title || null, itemName, productDesc || null, itemImage || null]
    );

<<<<<<< HEAD
    await conn.commit();
=======
    // [추가] 신청 접수 -> 마켓 주최자에게 알림
    await createNotification({
      userId: marketRows[0].hostId,
      audience: 'host',
      type: 'application_received',
      title: '새 부스 신청',
      message: `"${marketRows[0].title}" 마켓 ${boothNumber}번 부스에 새로운 신청이 도착했습니다. (${itemName})`,
      marketId: Number(marketId),
      applicationId: result.insertId,
    });
>>>>>>> origin/feat/이효재

    return res.status(201).json({
      success: true,
      data: { applicationId: result.insertId, status: 'Pending' },
      message: '부스 신청이 완료되었습니다.',
    });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error('부스 신청 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 부스 신청에 실패했습니다.' });
  } finally {
    conn.release();
  }
}

// GET /api/applications/my (로그인 필요, 판매자 본인)
// [추가] 내가 신청한 부스 목록을 마켓 정보와 함께 조회합니다.
// markets 테이블은 조회(JOIN)만 하므로 marketController/marketRoutes는 건드리지 않습니다.
export async function getMyApplications(req, res) {
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `SELECT
         a.applicationId, a.marketId, a.boothNumber, a.title, a.itemName,
         a.productDesc, a.itemImage, a.status,a.paymentDueAt,
         m.title AS marketTitle, m.eventDate_min, m.eventDate_max, m.locationName,m.boothPrice,
         m.hostId, hu.nickname AS hostNickname,
         m.maxparticipants,
         (SELECT COUNT(*) FROM applications a2
           WHERE a2.marketId = a.marketId
             AND a2.status IN ('Pending', 'Approved', 'Paid')
         ) AS appliedBooths,
         (m.eventDate_min <= CURDATE()) AS eventEnded,
         r.rating AS myRating,
         EXISTS(
           SELECT 1 FROM payments p WHERE p.applicationId = a.applicationId AND p.status = 'Paid'
         ) AS isPaid,
          pay.refundAmount AS refundAmount
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       LEFT JOIN users hu ON hu.userId = m.hostId
       LEFT JOIN market_reviews r ON r.applicationId = a.applicationId
       LEFT JOIN payments pay ON pay.applicationId = a.applicationId
       WHERE a.sellerId = ?
       ORDER BY a.applicationId DESC`,
      [userId]
    );

    return res.status(200).json({ success: true, data: rows, message: '내 부스 신청 목록을 조회했습니다.' });
  } catch (error) {
    console.error('내 부스 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 목록을 불러오지 못했습니다.' });
  }
}

// PATCH /api/applications/:applicationId (로그인 필요, 신청자 본인만)
// [추가] 대기중(Pending) 상태인 신청만 수정할 수 있습니다.
// 이미 승인/반려된 신청은 주최자가 이미 확인한 건이라 수정 대상에서 제외합니다.
export async function updateMyApplication(req, res) {
  const { userId } = req.user;
  const { applicationId } = req.params;
  const { boothNumber, title, itemName, productDesc, itemImage } = req.body;

  try {
    const [rows] = await pool.query(
      'SELECT applicationId, marketId, sellerId, boothNumber, status FROM applications WHERE applicationId = ?',
      [applicationId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 신청을 찾을 수 없습니다.' });
    }
    const application = rows[0];
    if (Number(application.sellerId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인의 신청 건만 수정할 수 있습니다.' });
    }
    if (application.status !== 'Pending') {
      return res.status(409).json({ success: false, data: null, message: '대기중인 신청만 수정할 수 있습니다.' });
    }

    // [부스 신청 정합성] 부스 번호를 바꾸는 경우, 신규 신청과 똑같은 검사를 다시 합니다.
    //   이 검사가 없으면 "빈 부스로 신청 -> 수정으로 남의 부스에 끼어들기" 우회가 가능합니다.
    //   excludeApplicationId 로 자기 자신은 점유/정원 계산에서 빼야 "그대로 저장"이 막히지 않습니다.
    const nextBooth = boothNumber || application.boothNumber;
    if (String(nextBooth) !== String(application.boothNumber)) {
      const check = await checkBoothApplyEligibility(pool, {
        userId,
        marketId: application.marketId,
        boothNumber: nextBooth,
        excludeApplicationId: application.applicationId,
      });
      if (!check.ok) {
        return res.status(check.status).json({
          success: false,
          data: null,
          code: check.code,
          message: check.message,
        });
      }
    }

    await pool.query(
      `UPDATE applications
       SET boothNumber = COALESCE(?, boothNumber),
           title = COALESCE(?, title),
           itemName = COALESCE(?, itemName),
           productDesc = ?,
           itemImage = COALESCE(?, itemImage)
       WHERE applicationId = ?`,
      [boothNumber || null, title || null, itemName || null, productDesc ?? application.productDesc ?? null, itemImage || null, applicationId]
    );

    return res.status(200).json({
      success: true,
      data: { applicationId: Number(applicationId) },
      message: '신청 정보를 수정했습니다.',
    });
  } catch (error) {
    console.error('내 부스 신청 수정 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 수정에 실패했습니다.' });
  }
}

// DELETE /api/applications/:applicationId (로그인 필요, 신청자 본인만)
// [추가] 대기중(Pending) 상태인 신청만 취소할 수 있습니다.
export async function deleteMyApplication(req, res) {
  const { userId } = req.user;
  const { applicationId } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.status, a.boothNumber, a.itemName,
              m.marketId, m.hostId, m.title AS marketTitle
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.applicationId = ?`,
      [applicationId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 신청을 찾을 수 없습니다.' });
    }
    const application = rows[0];
    if (Number(application.sellerId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인의 신청 건만 삭제할 수 있습니다.' });
    }
    if (application.status !== 'Pending') {
      return res.status(409).json({ success: false, data: null, message: '대기중인 신청만 취소할 수 있습니다.' });
    }

    await pool.query('DELETE FROM applications WHERE applicationId = ?', [applicationId]);

    // [추가] 신청 취소 -> 마켓 주최자에게 알림 (삭제 전에 확보해 둔 정보 사용, applicationId는 삭제 후라 연결하지 않음)
    await createNotification({
      userId: application.hostId,
      audience: 'host',
      type: 'application_cancelled',
      title: '부스 신청 취소',
      message: `"${application.marketTitle}" 마켓 ${application.boothNumber}번 부스 신청이 판매자에 의해 취소되었습니다. (${application.itemName})`,
      marketId: application.marketId,
    });

    return res.status(200).json({
      success: true,
      data: { applicationId: Number(applicationId) },
      message: '신청을 취소했습니다.',
    });
  } catch (error) {
    console.error('내 부스 신청 삭제 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 삭제에 실패했습니다.' });
  }
}

// [추가] buildNotification(row) => { type, title, message } | null 을 넘기면
// 상태 변경 성공 후 row(신청+마켓 정보)를 바탕으로 판매자에게 알림을 보냅니다.
async function updateApplicationStatus(req, res, nextStatus, successMessage, buildNotification) {
  const { userId } = req.user;
  const { applicationId } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.boothNumber, a.itemName, m.marketId, m.hostId, m.title AS marketTitle
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.applicationId = ?`,
      [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 신청을 찾을 수 없습니다.' });
    }
    const application = rows[0];
    if (Number(application.hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인 마켓의 신청 건만 처리할 수 있습니다.' });
    }

    await pool.query('UPDATE applications SET status = ? WHERE applicationId = ?', [nextStatus, applicationId]);

    if (typeof buildNotification === 'function') {
      const n = buildNotification(application);
      if (n) {
        await createNotification({
          userId: application.sellerId,
          audience: 'seller',
          marketId: application.marketId,
          applicationId: application.applicationId,
          ...n,
        });
      }
    }

    return res.status(200).json({ success: true, data: { applicationId: Number(applicationId), status: nextStatus }, message: successMessage });
  } catch (error) {
    console.error('신청 상태 변경 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 신청 처리에 실패했습니다.' });
  }
}

// PATCH /api/applications/:applicationId/approve (로그인 필요, 마켓 주최자)
// [추가] 승인과 동시에 결제 기한(paymentDueAt)을 설정합니다. 기본 1440분(24시간),
// body.paymentWindowMinutes 로 조절 가능합니다. 이 기한을 넘기고 미결제 상태면
// PATCH /markets/:marketId/queue/process-timeouts 처리 시 자동으로 Expired 되고
// 같은 부스의 다음 대기(Pending) 신청이 자동 승인됩니다.
// [추가] 같은 부스(marketId + boothNumber)에 이미 Approved 상태인 신청이 있으면 409로 막습니다
// (한 부스는 한 번에 한 명만 점유하는 대기열 구조).
export async function approveSellerApplication(req, res) {
  const { userId } = req.user;
  const { applicationId } = req.params;

  try {
    const [rows] = await pool.query(
<<<<<<< HEAD
      `SELECT a.applicationId, a.marketId, a.boothNumber, m.hostId, m.allowOvercapacity, m.eventDate_min
=======
      `SELECT a.applicationId, a.marketId, a.boothNumber, a.sellerId, a.itemName, m.hostId, m.title AS marketTitle
>>>>>>> origin/feat/이효재
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.applicationId = ?`,
      [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 신청을 찾을 수 없습니다.' });
    }
    const application = rows[0];
    if (Number(application.hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인 마켓의 신청 건만 처리할 수 있습니다.' });
    }

    const [conflicts] = await pool.query(
      `SELECT applicationId FROM applications
       WHERE marketId = ? AND boothNumber = ? AND status = 'Approved' AND applicationId != ?`,
      [application.marketId, application.boothNumber, applicationId]
    );
    if (conflicts.length > 0) {
      // [초과 신청 허용] 정원 초과 신청과 마찬가지로, 주최자가 markets.allowOvercapacity 를
      // 켜뒀고 아직 행사가 시작되지 않았다면 같은 부스 번호라도 초과 승인을 허용합니다.
      // (자유 텍스트 부스 번호라 서로 다른 신청이 같은 번호를 쓸 수 있음 — 이 경우 정원처럼
      //  "행사개최전까지" 주최자 재량으로 겹쳐 받을 수 있게 열어둡니다.)
      const eventStart = toDateKey(application.eventDate_min);
      const beforeEvent = eventStart ? todayKey() < eventStart : true;
      const overcapacityAllowed = Number(application.allowOvercapacity) === 1 && beforeEvent;

      if (!overcapacityAllowed) {
        return res.status(409).json({ success: false, data: null, message: '해당 부스는 이미 다른 신청이 승인되어 있습니다.' });
      }
    }

    await pool.query(
      `UPDATE applications SET status = 'Approved', paymentDueAt = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE applicationId = ?`,
      [ applicationId]
    );

    const [updatedRows] = await pool.query('SELECT paymentDueAt FROM applications WHERE applicationId = ?', [applicationId]);

    // [추가] 승인 -> 판매자에게 알림
    await createNotification({
      userId: application.sellerId,
      audience: 'seller',
      type: 'application_approved',
      title: '부스 신청 승인',
      message: `"${application.marketTitle}" 마켓 ${application.boothNumber}번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (${application.itemName})`,
      marketId: application.marketId,
      applicationId: application.applicationId,
    });

    return res.status(200).json({
      success: true,
      data: { applicationId: Number(applicationId), status: 'Approved', paymentDueAt: updatedRows[0].paymentDueAt },
      message: '신청을 승인했습니다.',
    });
  } catch (error) {
    console.error('신청 승인 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 신청 처리에 실패했습니다.' });
  }
}

// PATCH /api/applications/:applicationId/reject (로그인 필요, 마켓 주최자)
export async function rejectSellerApplication(req, res) {
  return updateApplicationStatus(req, res, 'Rejected', '신청을 반려했습니다.', (application) => ({
    type: 'application_rejected',
    title: '부스 신청 반려',
    message: `"${application.marketTitle}" 마켓 ${application.boothNumber}번 부스 신청이 반려되었습니다. (${application.itemName})`,
  }));
}
