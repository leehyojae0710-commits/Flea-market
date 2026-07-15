// backend/routes/marketRoutes.js
import express from 'express';
import pool from '../config/db.js';
import { attachUserIfLoggedIn } from '../middlewares/authMiddleware.js';

const router = express.Router();

// 마켓 목록 조회 (필터 + 정렬) — 로그인 없어도 조회 가능, 로그인했으면 내 지역 우선 정렬
router.get('/', attachUserIfLoggedIn, async (req, res) => {
  const { region, sort } = req.query;

  try {
    // 로그인한 사용자의 지역 조회 (있으면)
    let myRegion = null;
    if (req.user) {
      const [userRows] = await pool.query('SELECT region FROM users WHERE userId = ?', [req.user.userId]);
      if (userRows.length > 0) {
        myRegion = userRows[0].region;
      }
    }

    let sql = `
      SELECT marketId, title, locationName, eventDate, region, category, boothPrice
      FROM markets
      WHERE isExpired = 0 AND eventDate >= CURDATE()
    `;
    const params = [];

    // 사용자가 필터에서 지역을 직접 골랐으면 그게 우선 (내 지역 우선정렬보다 명시적 필터가 우선)
    if (region) {
      sql += ' AND region = ?';
      params.push(region);
    }

    const baseOrder = sort === 'latest' ? 'marketId DESC' : 'eventDate ASC';

    if (myRegion && !region) {
      // 명시적 지역 필터가 없을 때만 "내 지역 우선" 적용
      sql += ' ORDER BY (region = ?) DESC, ' + baseOrder;
      params.push(myRegion);
    } else {
      sql += ' ORDER BY ' + baseOrder;
    }

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