import pool from '../config/db.js';
// [부스 신청 정합성] 본인 마켓 여부 판정을 신청 정책 모듈과 공유합니다.
import { isOwnMarketPayment } from '../utills/applicationPolicy.js';
import { verifyPayment, cencelPayment } from '../services/paymentService.js';
import { calculateRefundRate } from '../utills/refundPolicy.js'

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
      `SELECT p.paymentId, p.paymentKey, p.status, p.amount, p.refundAmount,m.hostId
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

    if (payment.status == 'Paid') {
      console.log('여기 실행됨: Paid 분기, reason =', reason);
      const cancelResult = await cencelPayment(
        payment.paymentKey,
        reason || '주최자 요청에 의한 환불'
      )
    }

    if (payment.status == 'RefundRequested') {
      console.log('여기 실행됨: RefundRequested 분기, refundAmount =', payment.refundAmount);
      // 📌 미리 계산해둔 refundAmount로 부분 환불 실행
      await cencelPayment(payment.paymentKey, '환불 승인 처리', payment.refundAmount);
    }

    await pool.query(
      /*sql*/ `UPDATE payments SET status = 'Refunded', refundReason = ? WHERE applicationId = ?`,
      [reason, applicationId]);
    await pool.query(
      /*sql*/
      `UPDATE applications 
      SET status = 'Refunded' 
      WHERE applicationId = ?`,
      [applicationId]);
    return res.status(200).json({
      success: true,
      data: { applicationId, status: 'Refunded' },
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
      `SELECT p.paymentId, p.amount, p.status, a.sellerId, m.hostId, m.eventDate_min
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

    // [3.11.6.2] 본인이 주최한 마켓의 건은 환불 요청 대상이 아닙니다.
    //   자기신청 차단으로 이제는 생길 수 없는 데이터지만, 차단 이전에 쌓인 건이 남아 있을 수 있어 함께 막습니다.
    if (isOwnMarketPayment(payment.hostId, userId)) {
      return res.status(403).json({
        success: false,
        code: 'SELF_MARKET_REFUND_FORBIDDEN',
        message: '본인이 주최한 마켓의 결제 건입니다. 마켓 관리 화면에서 처리해 주세요.',
      });
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

// export async function paymentHistory(req, res) {
//   console.log("들어옴");
//   const { hostId } = req.userId;
//   const { applicationId } = req.body;

//   try {
//     const [dataA] = await pool.query(
//       `SELECT * FROM users WHERE userId =?`, [hostId]
//     );
//     if (dataA.userType === 1) {
//       const [mergedData] = await pool.query(
//         `SELECT a.* 
//         CASE
//         WHEN a.status = 'Paid' THEN p.amount
//         ELSE p.refundAmount
//         END AS price
//         FROM applications a
//          INNER JOIN markets m ON a.marketId = m.marketId
//          LEFT JOIN payment p ON a.applicationId = p.applicationId
//          WHERE m.hostId = ? AND a.status IN ('Paid','Refunded')`,
//         [hostId]
//       );

//       if (mergedData.length === 0) {
//         return res.status(500).json({ success: false, message: '마켓을 찾을 수 없거나 결제된 내역이 없습니다.' });
//       }
//       console.log(mergedData);
//       return res.status(200).json({
//       success: true,
//       data: mergedData,
//       message: "데이터 보내기 성공"
//     });
//     }
//     else {
//       console.log("이곳이 눌림")
//     }
//   }
//   catch (error) {
//     console.log("에러")
//   }
// }

/*
결제 내역 필요한 기능
<주최자>
내가 주최한 마켓에 대한 마켓 타이틀과 총 금액을 보이게 
상세보기 -> 유저 닉네임과 금액
<판매자>
내가 참가한 마켓에 대한 마켓 타이틀과 금액이 보이게
상세보기 -> 영수증 html 보이게
영수증 -> 결제한 시간 , 마켓 이름, 회사명, 닉네임. 금액
 */