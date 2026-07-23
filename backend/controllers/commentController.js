// backend/controllers/commentController.js
// 담당 D: 댓글 (공고/판매자 페이지 공용)

import pool from '../config/db.js';

// POST /api/comments (로그인 필요)
export async function createComment(req, res) {
  const { userId } = req.user;
  const { targetType, targetId, content, parentId } = req.body;

  if (!targetType || !targetId || !content) {
    return res.status(400).json({ success: false, data: null, message: 'targetType, targetId, content는 필수입니다.' });
  }

  try {
    // parentId가 있으면 대댓글: 부모 댓글이 실제로 존재하고, 같은 targetType/targetId에 속하는지 확인
    if (parentId) {
      const [parentRows] = await pool.query(
        `SELECT commentId FROM comments WHERE commentId = ? AND targetType = ? AND targetId = ?`,
        [parentId, targetType, targetId]
      );
      if (parentRows.length === 0) {
        return res.status(400).json({ success: false, data: null, message: '답글을 달 원본 댓글을 찾을 수 없습니다.' });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO comments (targetType, targetId, userId, content, parentId) VALUES (?, ?, ?, ?, ?)`,
      [targetType, targetId, userId, content, parentId || null]
    );

    return res.status(201).json({
      success: true,
      data: { commentId: result.insertId, targetType, targetId, userId, content, parentId: parentId || null },
      message: parentId ? '답글이 등록되었습니다.' : '댓글이 등록되었습니다.',
    });
  } catch (error) {
    console.error('댓글 등록 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 댓글 등록에 실패했습니다.' });
  }
}

// GET /api/comments?targetType=&targetId=
export async function getCommentList(req, res) {
  const { targetType, targetId } = req.query;

  if (!targetType || !targetId) {
    return res.status(400).json({ success: false, data: null, message: 'targetType, targetId 쿼리 파라미터는 필수입니다.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT c.*, u.nickname
       FROM comments c
       JOIN users u ON u.userId = c.userId
       WHERE c.targetType = ? AND c.targetId = ?
       ORDER BY c.createdAt ASC`,
      [targetType, targetId]
    );
    return res.status(200).json({ success: true, data: rows, message: '댓글 목록을 조회했습니다.' });
  } catch (error) {
    console.error('댓글 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 댓글 목록 조회에 실패했습니다.' });
  }
}
