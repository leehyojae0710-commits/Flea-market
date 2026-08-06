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

      // [수정] 메인 목록(getMarketList)과 동일하게 주최자 닉네임(hostNickname)과
      //   실시간 부스 신청 수(appliedBooths)를 함께 계산해서 내려줘야 합니다.
      //   기존에는 m.* 만 조회해서 이 두 값이 응답에 없었고, 그 결과 프론트의
      //   getBoothStats()가 appliedBooths를 0으로 처리해 검색 시 부스 신청
      //   게이지가 0%로 초기화되는 문제가 있었습니다.
      //   또한 main.js 카드 렌더링은 m.hostNickname 을 쓰는데 기존 쿼리는 markets
      //   테이블만 봐서 hostNickname 이 없었고, 검색 결과 카드에는 닉네임 대신
      //   ProfileLink 가 폴백으로 쓰는 hostId(숫자)가 그대로 보였습니다.
      //   getMarketList()(marketController.js)와 동일하게 users 조인 + 모집 부스 수를 추가합니다.
      const marketQuery = `
        SELECT m.*,
          u.nickname AS hostNickname,
          (SELECT COUNT(*) FROM applications a
            WHERE a.marketId = m.marketId
              AND a.status IN ('Pending', 'Approved', 'Paid')
          ) AS appliedBooths
        FROM markets m
        JOIN users u ON u.userId = m.hostId
        WHERE (? = '' OR m.title LIKE ? OR m.description LIKE ? OR m.locationName LIKE ? OR m.region LIKE ?)
          AND m.isExpired <> 2
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