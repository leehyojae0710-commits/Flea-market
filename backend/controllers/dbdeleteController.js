import {dbdelete}  from '../utills/DBdelete.js';
import pool from '../config/db.js';
// [마켓 취소] 전액 환불 계산·실행과 취소 알림
import {
  buildCancelPreview, refundAllForMarket, summarizePreview,
} from '../utills/marketCancellation.js';
import { createNotification, createNotifications } from '../services/notificationService.js';

//마켓
// [변경] 실제로 행을 DELETE 하지 않고 isExpired 을 2(삭제됨)로 바꾸는 소프트 삭제 방식으로 변경했습니다.
// isExpired: 0 = 모집중, 1 = 마감, 2 = 주최자가 삭제함
// 이렇게 하면 이 마켓에 신청했던 판매자들의 신청 내역(applications)이나 마이페이지 "행사 현황" 집계가
// 마켓이 통째로 사라져서 깨지는 일 없이, "삭제된 마켓"이라는 상태로 계속 남아있을 수 있습니다.
export async function deleteMarket(req, res) {
  const { marketId } = req.params;
  const { userId } = req.user;

  try {
    const [rows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 마켓입니다.' });
    }
    if (rows[0].hostId !== userId) {
      return res.status(403).json({ success: false, message: '본인이 등록한 마켓만 삭제할 수 있습니다.' });
    }

    // [마켓 취소] 확정 정책 — 주최자가 취소하면 결제 완료 건은 전액 환불하고 신청자 전원에게 알립니다.
    //   예전에는 isExpired=2 만 찍고 끝나서, 판매자는 통보도 못 받고 돈도 못 돌려받았습니다.
    const preview = await buildCancelPreview(pool, marketId);

    // 돈이 나가는 동작이라, 주최자가 금액을 확인했다는 신호(confirmRefund) 없이는 진행하지 않습니다.
    //   화면에서 미리보기를 띄우지만, API 를 직접 부르는 경로도 있으므로 서버에서 한 번 더 막습니다.
    if (preview.refundCount > 0 && req.body?.confirmRefund !== true) {
      return res.status(409).json({
        success: false,
        code: 'CANCEL_CONFIRM_REQUIRED',
        data: preview,
        message: `이 마켓에는 결제 완료된 신청이 ${preview.refundCount}건 있습니다. `
          + `취소하면 ${preview.refundTotal.toLocaleString()}원을 전액 환불해야 합니다. `
          + '금액을 확인한 뒤 다시 요청해 주세요.',
      });
    }

    const result = await refundAllForMarket(pool, {
      marketId,
      preview,
      reason: req.body?.reason || '주최자의 마켓 취소',
    });

    await pool.query('UPDATE markets SET isExpired = 2 WHERE marketId = ?', [marketId]);

    // 신청자 전원에게 알림 — 결제한 사람에게는 환불 금액을 함께 알려줍니다.
    const [[marketRow]] = await pool.query('SELECT title FROM markets WHERE marketId = ?', [marketId]);
    const marketTitle = marketRow?.title || '마켓';

    const refundedIds = new Set(result.refunded.map((r) => r.applicationId));
    const failedIds = new Set(result.failed.map((r) => r.applicationId));

    for (const item of preview.items) {
      let message;
      if (refundedIds.has(item.applicationId)) {
        message = `"${marketTitle}" 마켓이 주최자에 의해 취소되었습니다. `
          + `결제하신 ${item.paidAmount.toLocaleString()}원은 전액 환불 처리되었습니다.`;
      } else if (failedIds.has(item.applicationId)) {
        message = `"${marketTitle}" 마켓이 주최자에 의해 취소되었습니다. `
          + `결제하신 ${item.paidAmount.toLocaleString()}원의 환불 처리 중 문제가 발생했습니다. `
          + '주최자가 확인 후 다시 처리할 예정입니다.';
      } else {
        message = `"${marketTitle}" 마켓이 주최자에 의해 취소되었습니다. `
          + `${item.boothNumber}번 부스 신청도 함께 취소되었습니다. (결제 전이라 환불 대상은 없습니다)`;
      }

      await createNotification({
        userId: item.sellerId,
        audience: 'seller',
        type: 'market_cancelled',
        title: '마켓 취소',
        message,
        marketId: Number(marketId),
        applicationId: item.applicationId,
      });
    }

    // 환불에 실패한 건이 있으면 주최자에게 알려 재시도하게 합니다.
    if (result.failed.length > 0) {
      await createNotification({
        userId,
        audience: 'host',
        type: 'market_cancelled',
        title: '환불 실패 건 확인 필요',
        message: `"${marketTitle}" 마켓 취소 중 ${result.failed.length}건의 환불이 실패했습니다. `
          + '결제 내역에서 개별 환불로 다시 시도해 주세요.',
        marketId: Number(marketId),
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        refundedCount: result.refunded.length,
        refundedTotal: result.refunded.reduce((sum, r) => sum + r.paidAmount, 0),
        failed: result.failed,
        cancelledUnpaid: result.cancelledUnpaid,
        notifiedCount: preview.items.length,
        summary: summarizePreview(preview),
      },
      message: result.failed.length > 0
        ? `마켓이 취소되었습니다. 다만 ${result.failed.length}건의 환불이 실패했어요. 결제 내역에서 개별 환불로 다시 시도해 주세요.`
        : `마켓이 취소되었습니다. ${result.refunded.length}건 환불, 신청자 ${preview.items.length}명에게 알림을 보냈습니다.`,
    });
  } catch (error) {
    console.error('마켓 삭제 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

// GET /api/markets/:marketId/cancel-preview (로그인 필요, 주최자 본인)
// [마켓 취소] 취소 버튼을 누르기 "전에" 무슨 일이 벌어지는지 보여줍니다. DB 를 바꾸지 않습니다.
//   부스 종류(A/B/C)별로 몇 건 얼마인지, 총 환불액이 얼마인지 계산해서 돌려줍니다.
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