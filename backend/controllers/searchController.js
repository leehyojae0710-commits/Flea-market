import db from '../config/db.js';

// main.js의 isRecruitingNow / isOngoingNow / isUpcomingNow / isEndedNow와 동일한 기준.
// 값 자체는 고정된 SQL 조각이라 사용자 입력이 그대로 쿼리에 들어가지 않음 (tab은 아래 키 중 하나인지 확인 후에만 사용).
const TAB_STATUS_CONDITIONS = {
  recruiting: 'recruitmentDate_min <= CURDATE() AND CURDATE() <= recruitmentDate_max',
  ongoing: 'eventDate_min <= CURDATE() AND CURDATE() <= eventDate_max',
  upcoming: 'CURDATE() < eventDate_min',
  ended: 'eventDate_max < CURDATE()',
};

// main.js와 동일한 정렬 옵션. 고정된 SQL 조각만 매핑에서 골라 쓰므로 인젝션 위험 없음.
const SORT_CLAUSES = {
  latest: 'm.marketId DESC',
  eventDate: 'm.eventDate_min ASC',
  priceLow: 'm.boothPrice ASC',
};

export const searchItems = async (req, res) => {
  try {
    const { keyword = '', type = 'all', tab = '', sort = '' } = req.query;
    const searchPattern = `%${keyword.trim()}%`;

    let marketResults = [];
    let boothResults = [];

    // 1. 마켓 검색 (title, description, locationName, region에서 키워드 검색)
    if (type === 'all' || type === 'market') {
      // 프론트에서 현재 선택된 탭(진행 중/모집 중/진행 예정/종료)이 넘어오면 그 상태에 맞는 마켓만 검색
      const statusClause = TAB_STATUS_CONDITIONS[tab] ? `AND (${TAB_STATUS_CONDITIONS[tab]})` : '';
      const orderClause = SORT_CLAUSES[sort] || 'm.updated_at DESC';

      const marketQuery = `
        SELECT m.* FROM markets m
        WHERE (? = '' OR m.title LIKE ? OR m.description LIKE ? OR m.locationName LIKE ? OR m.region LIKE ?)
        ${statusClause}
        ORDER BY ${orderClause}
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