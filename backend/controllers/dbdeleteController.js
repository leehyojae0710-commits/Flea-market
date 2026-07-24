import {dbdelete}  from '../utills/DBdelete.js';
import pool from '../config/db.js';

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

    await pool.query('UPDATE markets SET isExpired = 2 WHERE marketId = ?', [marketId]);

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