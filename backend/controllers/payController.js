// backend/controllers/payController.js
// 담당 D: 모의 결제 (실제 PG 연동은 3주 일정상 제외)

import pool from '../config/db.js';

// POST /api/payments/fake (로그인 필요, 판매자 본인 신청 건만 결제 가능)
export async function processFakePayment(req, res) {
  const { userId } = req.user;
  const { applicationId } = req.body;

  if (!applicationId) {
    return res.status(400).json({ success: false, data: null, message: 'applicationId는 필수입니다.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.status, m.boothPrice
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
      return res.status(403).json({ success: false, data: null, message: '본인의 신청 건만 결제할 수 있습니다.' });
    }
    if (application.status !== 'Approved') {
      return res.status(409).json({ success: false, data: null, message: '승인된 신청만 결제할 수 있습니다.' });
    }

    const [result] = await pool.query(
      `INSERT INTO payments (applicationId, amount, status) VALUES (?, ?, 'Paid')`,
      [applicationId, application.boothPrice || 0]
    );

    return res.status(201).json({
      success: true,
      data: { paymentId: result.insertId, applicationId: Number(applicationId), amount: application.boothPrice || 0, status: 'Paid' },
      message: '결제(모의)가 완료되었습니다.',
    });
  } catch (error) {
    console.error('모의 결제 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 결제 처리에 실패했습니다.' });
  }
}
