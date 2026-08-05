import { dbdelete } from '../utills/DBdelete.js';
import pool from '../config/db.js';
// [마켓 취소 전액 환불] 이미 프로젝트에 있던 유틸을 그대로 씁니다.
//   utills/marketCancellation.js — 환불 대상 집계(buildCancelPreview) / 실행(refundAllForMarket)
//   그 안에서 utills/refundCore.js 를 불러, 건별 환불(POST /pay/refund)과 완전히 같은 절차로 처리합니다.
//   (결제사 취소 → payments.status='Refunded' → applications.status='Refunded')
import { buildCancelPreview, refundAllForMarket, summarizePreview } from '../utills/marketCancellation.js';
import { createNotification } from '../services/notificationService.js';

// GET /api/markets/:marketId/cancel-preview  (주최자 본인)
// [마켓 취소 전액 환불] 취소 버튼을 누르기 "전에" 환불 예상 금액을 계산해 돌려줍니다.
//   DB 를 읽기만 하고 아무것도 바꾸지 않습니다. 화면 모달이 이 값을 그대로 보여줍니다.
export async function getCancelPreview(req, res) {
  const { marketId } = req.params;
  const { userId } = req.user;

  try {
    const [rows] = await pool.query('SELECT hostId, title FROM markets WHERE marketId = ?', [marketId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '존재하지 않는 마켓입니다.' });
    }
    if (Number(rows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 확인할 수 있습니다.' });
    }

    const preview = await buildCancelPreview(pool, marketId);
    preview.marketTitle = rows[0].title;

    return res.status(200).json({
      success: true,
      data: preview,
      message: summarizePreview(preview),
    });
  } catch (error) {
    console.error('마켓 취소 미리보기 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 취소 정보를 불러오지 못했습니다.' });
  }
}
import { cencelPayment } from '../services/paymentService.js';

//마켓
// [변경] 실제로 행을 DELETE 하지 않고 isExpired 을 2(삭제됨)로 바꾸는 소프트 삭제 방식으로 변경했습니다.
// isExpired: 0 = 모집중, 1 = 마감, 2 = 주최자가 삭제함
// 이렇게 하면 이 마켓에 신청했던 판매자들의 신청 내역(applications)이나 마이페이지 "행사 현황" 집계가
// 마켓이 통째로 사라져서 깨지는 일 없이, "삭제된 마켓"이라는 상태로 계속 남아있을 수 있습니다.
//
// [추가] 취소하면 결제 완료 건을 전액 환불하고 신청자 전원에게 알립니다.
//   예전에는 isExpired=2 만 찍고 끝나서, 판매자는 통보도 못 받고 돈도 못 돌려받았습니다.
//   환불 비율은 utills/refundPolicy.js 의 기간별 정책(7일 전 100% / 3일 미만 0%)을 쓰지 않고
//   **항상 100%** 입니다. 마켓 취소는 주최자 사정이라 판매자에게 책임이 없기 때문입니다.

// 마켓 삭제 시 자동 환불
export async function deleteMarket(req, res) {
  const { marketId } = req.params;
  const { userId } = req.user;

  try {
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);

    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 마켓입니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, message: '본인이 등록한 마켓만 삭제할 수 있습니다.' });
    }

    await pool.query('UPDATE markets SET isExpired = 2 WHERE marketId = ?', [marketId]);

    const [applications] = await pool.query('SELECT * FROM applications WHERE marketId = ?', [marketId]);

    for (const application of applications) {
      if (application.status !== 'Paid') continue;

      try {
        const [paymentRows] = await pool.query(
          `SELECT p.paymentKey FROM payments p WHERE p.applicationId = ?`,
          [application.applicationId]
        );

        if (paymentRows.length === 0) {
          console.error(`applicationId ${application.applicationId}: 결제 정보를 찾을 수 없습니다.`);
          continue;
        }

        await cencelPayment(paymentRows[0].paymentKey, '마켓 취소로 인한 결제 취소');

        await pool.query(`UPDATE payments SET status = 'Refunded' WHERE applicationId = ?`, [application.applicationId]);
        await pool.query(`UPDATE applications SET status = 'Refunded' WHERE applicationId = ?`, [application.applicationId]);
      } catch (error) {
        console.error(`applicationId ${application.applicationId} 환불 처리 실패:`, error.message);
      }
    }

    return res.status(200).json({ success: true, message: '마켓이 삭제되었습니다.' });
  } catch (error) {
    console.error('마켓 삭제 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

//신청취소
export async function cancelApplication(req, res) {
  const { applicationId } = req.params;

  try {
    const result = await dbdelete('applications', applicationId);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 신청입니다.' });
    }

    return res.status(200).json({ success: true, message: '신청이 취소되었습니다.' });
  } catch (error) {
    console.error('신청 취소 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

//댓글삭제 (본인 댓글만) - 삭제 자체는 dbdelete()를 그대로 쓰고, 그 앞에 작성자 인증만 추가
export async function deleteComment(req, res) {
  const { commentId } = req.params;
  const { userId } = req.user; // authenticateToken 미들웨어가 넣어줌

  try {
    const [rows] = await pool.query('SELECT userId FROM comments WHERE commentId = ?', [commentId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 댓글입니다.' });
    }
    if (rows[0].userId !== userId) {
      return res.status(403).json({ success: false, message: '본인이 작성한 댓글만 삭제할 수 있습니다.' });
    }

    // parentId FK가 ON DELETE CASCADE라 이 댓글에 달린 대댓글도 함께 삭제됩니다.
    const result = await dbdelete('comments', commentId);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 댓글입니다.' });
    }

    return res.status(200).json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (error) {
    console.error('댓글 삭제 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}