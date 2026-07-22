// backend/controllers/myMarketController.js
// [담당 D 신규] 마켓 관리 - 내 마켓 목록 조회
// - 로그인한 주최자 본인이 등록한 마켓만 조회합니다.
// - 신규 파일이라 기존 marketController.js 는 건드리지 않습니다.

import pool from '../config/db.js';

// GET /api/my-markets?includeExpired=
export async function getMyMarkets(req, res) {
  const { userId } = req.user;
  const includeExpired = req.query.includeExpired === 'true';

  try {
    let sql = 'SELECT * FROM markets WHERE hostId = ?';
    const values = [userId];

    if (!includeExpired) {
      sql += ' AND isExpired = 0';
    }
    sql += ' ORDER BY marketId DESC';

    const [rows] = await pool.query(sql, values);

    return res.status(200).json({
      success: true,
      data: rows,
      message: '내 마켓 목록을 조회했습니다.',
    });
  } catch (error) {
    console.error('내 마켓 목록 조회 오류:', error.message);
    return res.status(500).json({
      success: false,
      data: null,
      message: '서버 오류로 내 마켓 목록 조회에 실패했습니다.',
    });
  }
}
