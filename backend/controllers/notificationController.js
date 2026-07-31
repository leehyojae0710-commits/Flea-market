// backend/controllers/notificationController.js
// [추가] 알림(종 버튼) 목록 조회 / 안읽음 개수 / 읽음 처리

import pool from '../config/db.js';

// GET /api/notifications (로그인 필요) - 최근 알림 목록
export async function getNotifications(req, res) {
  const { userId } = req.user;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);

  try {
    const [rows] = await pool.query(
      `SELECT notificationId, audience, type, title, message, marketId, applicationId, isRead, createdAt
       FROM notifications
       WHERE userId = ?
       ORDER BY createdAt DESC
       LIMIT ?`,
      [userId, limit]
    );

    return res.status(200).json({ success: true, data: rows, message: '알림 목록을 조회했습니다.' });
  } catch (error) {
    console.error('알림 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 알림을 불러오지 못했습니다.' });
  }
}

// GET /api/notifications/unread-count (로그인 필요)
export async function getUnreadCount(req, res) {
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS unreadCount FROM notifications WHERE userId = ? AND isRead = 0`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: { unreadCount: rows[0].unreadCount },
      message: '안읽은 알림 개수를 조회했습니다.',
    });
  } catch (error) {
    console.error('안읽은 알림 개수 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 조회에 실패했습니다.' });
  }
}

// PATCH /api/notifications/:notificationId/read (로그인 필요, 본인 알림만)
export async function markNotificationRead(req, res) {
  const { userId } = req.user;
  const { notificationId } = req.params;

  try {
    const [rows] = await pool.query(
      'SELECT notificationId, userId FROM notifications WHERE notificationId = ?',
      [notificationId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 알림을 찾을 수 없습니다.' });
    }
    if (Number(rows[0].userId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인의 알림만 처리할 수 있습니다.' });
    }

    await pool.query('UPDATE notifications SET isRead = 1 WHERE notificationId = ?', [notificationId]);

    return res.status(200).json({ success: true, data: { notificationId: Number(notificationId) }, message: '알림을 읽음 처리했습니다.' });
  } catch (error) {
    console.error('알림 읽음 처리 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 처리에 실패했습니다.' });
  }
}

// PATCH /api/notifications/read-all (로그인 필요)
export async function markAllNotificationsRead(req, res) {
  const { userId } = req.user;

  try {
    await pool.query('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0', [userId]);
    return res.status(200).json({ success: true, data: null, message: '모든 알림을 읽음 처리했습니다.' });
  } catch (error) {
    console.error('전체 알림 읽음 처리 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 처리에 실패했습니다.' });
  }
}
