import pool from '../config/db.js';
import { verifyPayment, cencelPayment } from '../services/paymentService.js';
import { calculateRefundRate } from '../utills/refundPolicy.js'
import { createNotification } from '../services/notificationService.js';
// [부스 종류] 결제 금액은 "판매자가 고른 종류의 가격"으로 계산합니다.
//   getMyApplications 와 똑같은 SQL 조각을 써야 화면 금액과 실제 결제 금액이 어긋나지 않습니다.
import { boothTypePriceSql } from '../utills/boothTypes.js';
// [환불 공통 코어] 건별 환불 / 일괄 결제취소 / 마켓 취소 전액환불이 같은 절차를 쓰도록 모았습니다.
import { refundOneApplication, loadRefundTarget, REFUND_MODE } from '../utills/refundCore.js';

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
    const bt = await boothTypePriceSql(pool, { app: 'a', market: 'm', type: 'bt' });
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.status, a.boothNumber, a.itemName, a.marketId,
              ${bt.priceExpr} AS boothPrice,
              ${bt.nameExpr} AS boothTypeName,
              m.hostId, m.title AS marketTitle
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       ${bt.join}
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

    // [추가] 결제 완료 -> 마켓 주최자에게 알림
    await createNotification({
      userId: application.hostId,
      audience: 'host',
      type: 'payment_completed',
      title: '부스 결제 완료',
      message: `"${application.marketTitle}" 마켓 ${application.boothNumber}번 부스${application.boothTypeName ? `(${application.boothTypeName} 종류)` : ''}(${application.itemName}) 결제가 완료되었습니다. (${boothPrice.toLocaleString()}원)`,
      marketId: application.marketId,
      applicationId: application.applicationId,
    });

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
    // [정리] 결제 조회와 환불 절차를 utills/refundCore.js 로 옮겼습니다.
    //        마켓 취소 시 전액 환불이 같은 절차를 따로 구현하고 있어 동작이 갈렸기 때문입니다.
    //        이 API 의 동작(Paid=전액 / RefundRequested=부분)은 그대로입니다.
    const payment = await loadRefundTarget(pool, applicationId);

    if (!payment) {
      return res.status(404).json({ success: false, message: "결제 내역을 찾을 수 없습니다" });
    }

    if (Number(payment.hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, message: "결제 완료된 건만 환불할 수 있습니다." });
    }

    const result = await refundOneApplication(pool, {
      applicationId,
      reason,
      mode: REFUND_MODE.AUTO,
      payment,
    });

    if (!result.ok) {
      // 이미 환불된 건을 다시 누른 경우 등. 일괄 결제취소에서 같은 건이 두 번 걸릴 수 있습니다.
      return res.status(409).json({ success: false, code: result.code, message: result.message });
    }

    // [유지] 환불 완료 -> 판매자에게 알림
    await createNotification({
      userId: payment.sellerId,
      audience: 'seller',
      type: 'refund_completed',
      title: '환불 완료',
      message: `"${payment.marketTitle}" 마켓 ${payment.boothNumber}번 부스(${payment.itemName}) 환불이 완료되었습니다. (${Number(result.refundedAmount || 0).toLocaleString()}원)`,
      marketId: payment.marketId,
      applicationId: Number(applicationId),
    });

    return res.status(200).json({
      success: true,
      data: { applicationId, status: 'Refunded', refundedAmount: result.refundedAmount },
      message: '환불이 완료되었습니다.',
    });
  }
  catch (error) {
    console.error('환불 처리 오류:', error.message);
    return res.status(500).json({ success: false, message: error.message || '서버 오류가 발생했습니다.' });
  }
}

export async function requestRefund(req, res) {
  const { userId } = req.user;
  const { applicationId, reason } = req.body;

  try {
    const [rows] = await pool.query(
      /*SQL*/
      `SELECT p.paymentId, p.amount, p.status, a.sellerId, m.eventDate_min,
              m.hostId, m.title AS marketTitle, a.boothNumber, a.itemName, a.marketId
       FROM payments p
       JOIN applications a ON a.applicationId = p.applicationId
       JOIN markets m ON m.marketId = a.marketId
       WHERE p.applicationId = ?`
      , [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '결제 내역을 찾을 수 없습니다.' });
    }

    const payment = rows[0];

    if (Number(payment.sellerId) !== Number(userId)) {
      return res.status(403).json({ success: false, message: '본인의 결제 건만 환불 요청할 수 있습니다.' });
    }

    // 📌 환불 비율 계산
    const refundRate = calculateRefundRate(payment.eventDate_min);
    const refundAmount = Math.floor(payment.amount * refundRate);

    if (refundRate === 0) {
      return res.status(400).json({
        success: false,
        message: '행사가 임박하여 환불이 불가능합니다.',
      });
    }

    // 계산된 금액을 미리 저장해서, 주최자가 승인할 때 그대로 쓰게 함
    await pool.query(
      /*sql*/
      `UPDATE payments SET status = 'RefundRequested', refundReason = ?, refundAmount = ? WHERE applicationId = ?`,
      [reason, refundAmount, applicationId]
    );
    await pool.query(
      `UPDATE applications SET status = 'RefundRequested' WHERE applicationId = ?`,
      [applicationId]
    );

    // [추가] 환불 요청 -> 마켓 주최자에게 알림
    await createNotification({
      userId: payment.hostId,
      audience: 'host',
      type: 'refund_requested',
      title: '환불 요청',
      message: `"${payment.marketTitle}" 마켓 ${payment.boothNumber}번 부스(${payment.itemName})에 환불 요청이 접수되었습니다. (예정 금액: ${refundAmount.toLocaleString()}원)`,
      marketId: payment.marketId,
      applicationId: Number(applicationId),
    });

    return res.status(200).json({
      success: true,
      data: { refundRate: refundRate * 100, refundAmount },
      message: `환불 요청이 접수되었습니다. (환불 예정 금액: ${refundAmount.toLocaleString()}원, 환불율: ${refundRate * 100}%)`,
    });
  } catch (error) {
    console.error('환불 요청 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}
export async function paymentHistory(req, res) {
  console.log("들어옴");
  console.log(req.user.userId);
  const hostId = req.user.userId;
  console.log(hostId);
  //const { applicationId } = req.body;

  try {
    const [dataA] = await pool.query(
      `SELECT * FROM users WHERE userId =?`, [hostId]
    );
    if (dataA[0].userType === 1) {
      console.log("주최자")
      const [hostData] = await pool.query(
        /*sql*/
        `SELECT 
        a.applicationId,
        a.marketId,
        a.sellerId,
        a.itemName,
        a.status,
        m.title AS marketTitle,
        u.nickname AS sellerNickname,
        p.amount,
        IFNULL(p.refundAmount,0) AS refundAmount
        FROM applications a
        INNER JOIN markets m ON a.marketId = m.marketId
        INNER JOIN users u ON a.sellerId = u.userId
        LEFT JOIN payments p ON a.applicationId = p.applicationId
        WHERE m.hostId = ? AND a.status IN ('Paid', 'Refunded')`,
        [hostId]
      );

      if (hostData.length === 0) {
        return res.status(500).json({ success: false, message: '마켓을 찾을 수 없거나 결제된 내역이 없습니다.' });
      }
      console.log(hostData);
      return res.status(200).json({
        success: true,
        data: hostData,
        message: "데이터 보내기 성공"
      });
    }
    else {
      //판매자 쪽
      console.log("판매자")
      const [sellerData] = await pool.query(
        /*sql*/
        `SELECT
        a.applicationId,
        a.marketId,
        a.sellerId,
        a.status,
        m.title AS marketTitle,
        u.nickname AS sellerNickname,
        p.amount,
        IFNULL(p.refundAmount,0) AS refundAmount
        FROM applications a
        INNER JOIN markets m ON a.marketId = m.marketId
        INNER JOIN users u ON a.sellerId = u.userId
        LEFT JOIN payments p ON a.applicationId = p.applicationId
        WHERE a.sellerId =? AND a.status IN ('Paid','Refunded','RefundRequested')
        `,[hostId]
      );
      return res.status(200).json({
        success: true,
        data: sellerData,
        message: "데이터 보내기 성공"
      });
    }
  }
  catch (error) {
    console.log("에러")
    console.error('결제 내역 오류:', error.message);
  }
}