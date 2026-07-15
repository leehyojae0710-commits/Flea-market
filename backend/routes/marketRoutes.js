// backend/routes/marketRoutes.js
import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// 마켓 목록 조회 (필터 + 정렬) — 로그인 불필요
router.get('/', async (req, res) => {
  const { region, sort } = req.query;

  try {
    let sql = `
      SELECT marketId, title, locationName, eventDate, region, category, boothPrice
      FROM markets
      WHERE isExpired = 0 AND eventDate >= CURDATE()
    `;
    const params = [];

    if (region) {
      sql += ' AND region = ?';
      params.push(region);
    }

    sql += sort === 'latest' ? ' ORDER BY marketId DESC' : ' ORDER BY eventDate ASC';

    const [rows] = await pool.query(sql, params);

    const data = rows.map((m) => ({
      id: m.marketId,
      title: m.title,
      region: m.region,
      address: m.locationName,
      eventDate: m.eventDate,
      boothPrice: m.boothPrice,
      category: m.category,
    }));

    return res.status(200).json({ success: true, data, message: '마켓 목록 조회 성공' });
  } catch (error) {
    console.error('마켓 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, message: '서버 오류로 마켓 목록을 불러오지 못했습니다.' });
  }
});

export default router;