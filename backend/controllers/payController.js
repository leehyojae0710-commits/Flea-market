import pool from '../config/db.js';
import { verifyPayment, cencelPayment } from '../services/paymentService.js';

// POST /api/payments/confirm
// PortOne 결제 완료 후 호출
export async function confirmPayment(req, res) {
  const { userId } = req.user;
  const { applicationId } = req.body;
  let { paymentId } = req.body;

  // paymentId는 실제 결제(포트원)가 발생하는 유료 부스에서만 필수.
  // 부스료 0원인 경우는 아래에서 boothPrice를 확인한 뒤에 필수 여부를 판단한다.
  if (!applicationId) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'applicationId는 필수입니다.',
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

    const boothPrice = Number(application.boothPrice || 0);
    const isFreeBooth = boothPrice === 0;

    if (isFreeBooth) {
      // 부스료 0원: 실제로 결제할 금액이 없으므로 포트원 검증을 건너뛴다.
      // (paymentId도 없을 수 있음 — 프론트에서 포트원 결제창을 아예 띄우지 않음)
      paymentId = paymentId || null;
    } else {
      if (!paymentId) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'paymentId는 필수입니다.',
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
      if (Number(payment.amount.total) !== boothPrice) {
        return res.status(400).json({
          success: false,
          data: null,
          message: '결제 금액이 일치하지 않습니다.',
        });
      }
    }

    // 중복 결제(등록) 방지
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
    const [result] = await pool.query(
      `INSERT INTO payments (applicationId, amount, status, paymentKey)
   VALUES (?, ?, 'Paid', ?)`,
      [applicationId, application.boothPrice || 0, paymentId] // ← paymentId를 paymentKey 자리에 넣음
    );

    await pool.query(`UPDATE applications SET status = 'Paid' WHERE applicationId = ?`, [applicationId]);

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
        amount: boothPrice,
        status: 'Paid',
      },
      message: isFreeBooth ? '무료 부스 등록이 완료되었습니다.' : '결제가 완료되었습니다.',
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

export async function refundPayment(req, res) {
  const { userId } = req.user;
  const { applicationId, reason } = req.body;

  if (!applicationId) {
    return res.status(400).json({ success: false, message: 'applicationId는 필수 입니다' })
  }

  try {
    const [rows] = await pool.query(
      /*sql*/
      `SELECT p.paymentId, p.paymentKey, p.status, p.amount, m.hostId
       FROM payments p
       JOIN applications a ON a.applicationId = p.applicationId
       JOIN markets m ON m.marketId = a.marketId
       WHERE p.applicationId = ?`,
      [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "결제 내역을 찾을 수 없습니다" });
    }

    const payment = rows[0];

    if (Number(payment.hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, message: "결제 완료된 건만 환불할 수 있습니다." });
    }

    const cancelResult = await cencelPayment(
      payment.paymentKey,
      reason || '주최자 요청에 의한 환불'
    )

    await pool.query(
      /*sql*/ `UPDATE payments SET status = 'Refunded' WHERE applicationId = ?`,
      [applicationId]);
    await pool.query(
       /*sql*/ `UPDATE applications 
      SET status = 'Refunded' 
      WHERE applicationId = ?`,
      [applicationId]);
    return res.status(200).json({
      success: true,
      data: { applicationId, status: 'Refunded' },
      message: '환불이 완료되었습니다.',
    });
  }
  catch (err) {

  }
}