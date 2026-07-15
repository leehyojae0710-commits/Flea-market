// backend/controllers/scheduleController.js
// 담당 D: 내 일정(주최/참가) 조회
// 별도 schedules 테이블 없이 markets(내가 주최) + applications(내가 참가) 를 모아서 보여줍니다.

import pool from '../config/db.js';

// GET /api/schedules/me (로그인 필요)
export async function getMySchedule(req, res) {
  const { userId } = req.user;

  try {
    const [hosting] = await pool.query(
      `SELECT marketId, title, eventDate, locationName, isExpired, 'host' AS role
       FROM markets WHERE hostId = ? ORDER BY eventDate ASC`,
      [userId]
    );

    const [selling] = await pool.query(
      `SELECT m.marketId, m.title, m.eventDate, m.locationName, a.applicationId, a.status, 'seller' AS role
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.sellerId = ? ORDER BY m.eventDate ASC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: { hosting, selling },
      message: '내 일정을 조회했습니다.',
    });
  } catch (error) {
    console.error('내 일정 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 일정 조회에 실패했습니다.' });
  }
}
