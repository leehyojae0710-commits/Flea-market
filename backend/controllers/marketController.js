// backend/controllers/marketController.js
// 마켓(공고) 관련 로직 - 조회는 담당 C, 등록/신청목록은 담당 D, 좌표 저장은 담당 E

import pool from '../config/db.js';

// GET /api/markets?region=&sort=latest|eventDate&includeExpired=
export async function getMarketList(req, res) {
  const { region, sort } = req.query;
  const includeExpired = req.query.includeExpired === 'true';

  try {
    let sql = `
      SELECT m.*, u.region AS hostRegion
      FROM markets m
      JOIN users u ON u.userId = m.hostId
    `;
    const conditions = [];
    const values = [];

    if (!includeExpired) conditions.push('m.isExpired = 0');
    if (region) { conditions.push('u.region = ?'); values.push(region); }
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;

    sql += sort === 'eventDate' ? ' ORDER BY m.eventDate ASC' : ' ORDER BY m.marketId DESC';

    const [rows] = await pool.query(sql, values);
    return res.status(200).json({ success: true, data: rows, message: '마켓 목록을 조회했습니다.' });
  } catch (error) {
    console.error('마켓 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 목록 조회에 실패했습니다.' });
  }
}

// GET /api/markets/:marketId
export async function getMarketDetail(req, res) {
  const { marketId } = req.params;

  try {
    const [rows] = await pool.query('SELECT * FROM markets WHERE marketId = ?', [marketId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    return res.status(200).json({ success: true, data: rows[0], message: '마켓 상세 정보를 조회했습니다.' });
  } catch (error) {
    console.error('마켓 상세 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 상세 조회에 실패했습니다.' });
  }
}

// POST /api/markets (로그인 필요, 주최자)
export async function createMarket(req, res) {
  const { userId } = req.user;
  const { title, description, marketImage, locationName, latitude, longitude, eventDate, boothPrice } = req.body;

  if (!title || !eventDate || !locationName) {
    return res.status(400).json({ success: false, data: null, message: '마켓 이름, 개최 일자, 장소는 필수입니다.' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO markets (hostId, title, description, marketImage, locationName, latitude, longitude, eventDate, boothPrice)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, description || '', marketImage || null, locationName, latitude || 0, longitude || 0, eventDate, boothPrice || 0]
    );

    return res.status(201).json({
      success: true,
      data: { marketId: result.insertId },
      message: '마켓이 등록되었습니다.',
    });
  } catch (error) {
    console.error('마켓 등록 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 등록에 실패했습니다.' });
  }
}

// PATCH /api/markets/:marketId (로그인 필요, 마켓 주최자 본인만) - 마감 처리 등 상태 변경
export async function updateMarketStatus(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;
  const { isExpired, title, description } = req.body;

  try {
    const [rows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(rows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 수정할 수 있습니다.' });
    }

    const fields = [];
    const values = [];
    if (isExpired !== undefined) { fields.push('isExpired = ?'); values.push(isExpired ? 1 : 0); }
    if (title) { fields.push('title = ?'); values.push(title); }
    if (description) { fields.push('description = ?'); values.push(description); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, data: null, message: '수정할 내용이 없습니다.' });
    }

    values.push(marketId);
    await pool.query(`UPDATE markets SET ${fields.join(', ')} WHERE marketId = ?`, values);

    return res.status(200).json({ success: true, data: null, message: '마켓 정보가 수정되었습니다.' });
  } catch (error) {
    console.error('마켓 상태 수정 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 마켓 수정에 실패했습니다.' });
  }
}

// PATCH /api/markets/:marketId/location (로그인 필요, 담당 E - 지도 좌표 저장)
export async function updateMarketLocation(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;
  const { latitude, longitude, locationName } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, data: null, message: '위도(latitude)와 경도(longitude)는 필수입니다.' });
  }

  try {
    const [rows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(rows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓만 수정할 수 있습니다.' });
    }

    await pool.query(
      `UPDATE markets SET latitude = ?, longitude = ?${locationName ? ', locationName = ?' : ''} WHERE marketId = ?`,
      locationName ? [latitude, longitude, locationName, marketId] : [latitude, longitude, marketId]
    );

    return res.status(200).json({ success: true, data: { latitude, longitude }, message: '마켓 좌표가 저장되었습니다.' });
  } catch (error) {
    console.error('마켓 좌표 저장 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 좌표 저장에 실패했습니다.' });
  }
}

// GET /api/markets/:marketId/applications (로그인 필요, 담당 D - 마켓 주최자용 신청 목록)
export async function getApplicationsByMarket(req, res) {
  const { userId } = req.user;
  const { marketId } = req.params;

  try {
    const [marketRows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [marketId]);
    if (marketRows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 마켓을 찾을 수 없습니다.' });
    }
    if (Number(marketRows[0].hostId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인이 등록한 마켓의 신청 목록만 조회할 수 있습니다.' });
    }

    const [rows] = await pool.query('SELECT * FROM applications WHERE marketId = ? ORDER BY applicationId DESC', [marketId]);
    return res.status(200).json({ success: true, data: rows, message: '신청 목록을 조회했습니다.' });
  } catch (error) {
    console.error('신청 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 신청 목록 조회에 실패했습니다.' });
  }
}
