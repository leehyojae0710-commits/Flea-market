import pool from '../config/db.js';
import { verifyPayment } from '../services/paymentService.js';

// POST /api/payments/confirm
// PortOne 결제 완료 후 호출
export async function confirmPayment(req, res) {
  const { userId } = req.user;
  const { applicationId, paymentId } = req.body;

  if (!applicationId || !paymentId) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'applicationId와 paymentId는 필수입니다.',
    });
  }

  try {
    // 신청 정보 조회
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.status, m.boothPrice
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.applicationId = ?`,
      [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        message: '해당 신청을 찾을 수 없습니다.',
      });
    }

    const application = rows[0];

    if (Number(application.sellerId) !== Number(userId)) {
      return res.status(403).json({
        success: false,
        data: null,
        message: '본인의 신청 건만 결제할 수 있습니다.',
      });
    }

    if (application.status !== 'Approved') {
      return res.status(409).json({
        success: false,
        data: null,
        message: '승인된 신청만 결제할 수 있습니다.',
      });
    }

    // PortOne 결제 검증
    const payment = await verifyPayment(paymentId);

    // 결제 완료 여부 확인
    if (payment.status !== 'PAID') {
      return res.status(400).json({
        success: false,
        data: null,
        message: '결제가 완료되지 않았습니다.',
      });
    }

    // 금액 검증
    if (Number(payment.amount.total) !== Number(application.boothPrice || 0)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: '결제 금액이 일치하지 않습니다.',
      });
    }

    // 중복 결제 방지
    const [paidRows] = await pool.query(
      `SELECT paymentId
      FROM payments
      WHERE applicationId = ? AND status = 'Paid'`,
      [applicationId]
    );

    if (paidRows.length > 0) {
      return res.status(409).json({
        success: false,
        data: null,
        message: '이미 결제가 완료된 신청입니다.',
      });
    }

    // 결제 저장
    const [result] = await pool.query(
      `INSERT INTO payments (applicationId, amount, status, paymentKey)
       VALUES (?, ?, 'Paid', ?)`,
      [applicationId, application.boothPrice || 0, paymentId]
    );

    // 결제 완료 → 결제 기한 제거
    await pool.query(
      'UPDATE applications SET paymentDueAt = NULL WHERE applicationId = ?',
      [applicationId]
    );

    return res.status(201).json({
      success: true,
      data: {
        paymentId: result.insertId,
        applicationId: Number(applicationId),
        amount: application.boothPrice || 0,
        status: 'Paid',
      },
      message: '결제가 완료되었습니다.',
    });
  } catch (error) {
    console.error('결제 검증 오류:', error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      data: null,
      message: '서버 오류로 결제 처리에 실패했습니다.',
    });
  }
}