// backend/controllers/applicationController.js
// 담당 D: 부스 신청 / 승인 / 반려

import pool from '../config/db.js';

// POST /api/applications (로그인 필요, 판매자)
export async function applyForBooth(req, res) {
  const { userId } = req.user;
  const { marketId, boothNumber, itemName, productDesc, itemImage } = req.body;

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
      `INSERT INTO applications (marketId, sellerId, boothNumber, itemName, productDesc, itemImage, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [marketId, userId, boothNumber, itemName, productDesc || null, itemImage || null]
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
export async function approveSellerApplication(req, res) {
  return updateApplicationStatus(req, res, 'Approved', '신청을 승인했습니다.');
}

// PATCH /api/applications/:applicationId/reject (로그인 필요, 마켓 주최자)
export async function rejectSellerApplication(req, res) {
  return updateApplicationStatus(req, res, 'Rejected', '신청을 반려했습니다.');
}
