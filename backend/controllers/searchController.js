import db from '../config/db.js';

export const searchItems = async (req, res) => {
  try {
    const { keyword = '', type = 'all' } = req.query;
    const searchPattern = `%${keyword.trim()}%`;

    let marketResults = [];
    let boothResults = [];

    // 1. 마켓 검색 (title, description, locationName, region에서 키워드 검색)
    if (type === 'all' || type === 'market') {
      const marketQuery = `
        SELECT * FROM markets 
        WHERE (? = '' OR title LIKE ? OR description LIKE ? OR locationName LIKE ? OR region LIKE ?)
        ORDER BY updated_at DESC
      `;
      const [rows] = await db.query(marketQuery, [
        keyword, 
        searchPattern, 
        searchPattern, 
        searchPattern, 
        searchPattern
      ]);
      marketResults = rows;
    }

    // 2. 부스 검색 (필요시)
    if (type === 'all' || type === 'booth') {
      const boothQuery = `
        SELECT * FROM booths 
        WHERE (? = '' OR name LIKE ? OR description LIKE ?)
      `;
      const [rows] = await db.query(boothQuery, [keyword, searchPattern, searchPattern]);
      boothResults = rows;
    }

    return res.status(200).json({
      success: true,
      keyword,
      markets: marketResults,
      booths: boothResults
    });
  } catch (error) {
    console.error('검색 API 오류:', error);
    return res.status(500).json({
      success: false,
      message: '검색 처리 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};