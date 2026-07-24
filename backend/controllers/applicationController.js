// backend/controllers/applicationController.js
// 담당 D: 부스 신청 / 승인 / 반려
// [추가] 판매자 본인의 신청 목록 조회 / 수정 / 취소(삭제)

import pool from '../config/db.js';

// POST /api/applications (로그인 필요, 판매자)
export async function applyForBooth(req, res) {
  const { userId } = req.user;
  const { marketId, boothNumber, title, itemName, productDesc, itemImage } = req.body;

  if (!marketId || !boothNumber || !itemName) {
    return res.status(400).json({ success: false, data: null, message: '마켓, 부스 번호, 물품명은 필수입니다.' });
  }

  try {
    const [marketRows] = await pool.query('SELECT marketId, isExpired FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (marketRows[0].isExpired) {
      return res.status(409).json({ success: false, data: null, message: '마감된 마켓에는 신청할 수 없습니다.' });
    }

    const [result] = await pool.query(
      `INSERT INTO applications (marketId, sellerId, boothNumber, title, itemName, productDesc, itemImage, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [marketId, userId, boothNumber, title || null, itemName, productDesc || null, itemImage || null]
    );

    return res.status(201).json({
      success: true,
      data: { applicationId: result.insertId, status: 'Pending' },
      message: '부스 신청이 완료되었습니다.',
    });
  } catch (error) {
    console.error('부스 신청 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 부스 신청에 실패했습니다.' });
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
         a.productDesc, a.itemImage, a.status,
         m.title AS marketTitle, m.eventDate_min, m.eventDate_max, m.locationName,
         (m.eventDate_max < CURDATE()) AS eventEnded,
         r.rating AS myRating
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       LEFT JOIN market_reviews r ON r.applicationId = a.applicationId
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
      'SELECT applicationId, sellerId, status FROM applications WHERE applicationId = ?',
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
      'SELECT applicationId, sellerId, status FROM applications WHERE applicationId = ?',
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

async function updateApplicationStatus(req, res, nextStatus, successMessage) {
  const { userId } = req.user;
  const { applicationId } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT a.applicationId, m.hostId
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.applicationId = ?`,
      [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 신청을 찾을 수 없습니다.' });
    }
    if (Number(rows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인 마켓의 신청 건만 처리할 수 있습니다.' });
    }

    await pool.query('UPDATE applications SET status = ? WHERE applicationId = ?', [nextStatus, applicationId]);

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
  const paymentWindowMinutes = Number(req.body?.paymentWindowMinutes) || 1440;

  try {
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.marketId, a.boothNumber, m.hostId
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
      return res.status(409).json({ success: false, data: null, message: '해당 부스는 이미 다른 신청이 승인되어 있습니다.' });
    }

    await pool.query(
      `UPDATE applications SET status = 'Approved', paymentDueAt = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE applicationId = ?`,
      [paymentWindowMinutes, applicationId]
    );

    const [updatedRows] = await pool.query('SELECT paymentDueAt FROM applications WHERE applicationId = ?', [applicationId]);

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
  return updateApplicationStatus(req, res, 'Rejected', '신청을 반려했습니다.');
}
