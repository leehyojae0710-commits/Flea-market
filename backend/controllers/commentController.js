// backend/controllers/commentController.js
// 담당 D: 댓글 (공고/판매자 페이지 공용)

import pool from '../config/db.js';

// POST /api/comments (로그인 필요)
export async function createComment(req, res) {
  const { userId } = req.user;
  const { targetType, targetId, content } = req.body;

  if (!targetType || !targetId || !content) {
    return res.status(400).json({ success: false, data: null, message: 'targetType, targetId, content는 필수입니다.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO comments (targetType, targetId, userId, content) VALUES (?, ?, ?, ?)`,
      [targetType, targetId, userId, content]
    );

    return res.status(201).json({
      success: true,
      data: { commentId: result.insertId, targetType, targetId, userId, content },
      message: '댓글이 등록되었습니다.',
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
