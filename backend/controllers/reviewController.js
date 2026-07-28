// backend/controllers/reviewController.js
// [추가] 행사 평가(별점) 기능
// - 부스 신청(application)이 승인(Approved)되고, 행사 기간(eventDate_max)이 지난 뒤에만
//   신청자 본인이 1회 평가를 남길 수 있습니다 (applicationId당 1건, UNIQUE 제약으로 이중 등록 방지).
// - 아직은 "별점만" 남기는 범위로 구현되어 있고, 코멘트 등은 추후 확장 가능합니다.

import pool from '../config/db.js';

// POST /api/reviews (로그인 필요, 판매자 본인)
export async function createReview(req, res) {
  const { userId } = req.user;
  const { applicationId, rating, comment } = req.body;

  if (applicationId === undefined || applicationId === null || rating === undefined || rating === null) {
    return res.status(400).json({ success: false, data: null, message: 'applicationId, rating은 필수입니다.' });
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 0 || ratingNum > 5) {
    return res.status(400).json({ success: false, data: null, message: '별점은 0~5 사이의 정수여야 합니다.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT a.applicationId, a.sellerId, a.status, a.marketId,
              (m.eventDate_min <= CURDATE()) AS eventEnded,
              EXISTS(
                SELECT 1 FROM payments p WHERE p.applicationId = a.applicationId AND p.status = 'Paid'
              ) AS isPaid
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.applicationId = ?`,
      [applicationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '해당 부스 신청을 찾을 수 없습니다.' });
    }

    const application = rows[0];
    if (Number(application.sellerId) !== Number(userId)) {
      return res.status(403).json({ success: false, data: null, message: '본인의 부스 신청만 평가할 수 있습니다.' });
    }
    if (application.status !== 'Approved') {
      return res.status(409).json({ success: false, data: null, message: '승인된 부스만 평가할 수 있습니다.' });
    }
    if (!application.isPaid) {
      return res.status(409).json({ success: false, data: null, message: '결제가 완료된 부스만 평가할 수 있습니다.' });
    }
    if (!application.eventEnded) {
      return res.status(409).json({ success: false, data: null, message: '행사가 시작된 뒤에만 평가할 수 있습니다.' });
    }

    const [existing] = await pool.query(
      'SELECT reviewId FROM market_reviews WHERE applicationId = ?',
      [applicationId]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, data: null, message: '이미 이 행사에 평가를 남겼습니다.' });
    }

    
    const trimmedComment = typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 200) : null;

    const [result] = await pool.query(
      `INSERT INTO market_reviews (applicationId, marketId, sellerId, rating, comment) VALUES (?, ?, ?, ?, ?)`,
      [applicationId, application.marketId, userId, ratingNum, trimmedComment]
    );

    return res.status(201).json({
      success: true,
      data: { reviewId: result.insertId, applicationId: Number(applicationId), rating: ratingNum, comment: trimmedComment },
      message: '평가를 등록했습니다.',
    });

  } catch (error) {
    console.error('별점 등록 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 별점 등록에 실패했습니다.' });
  }
}

// GET /api/reviews/market/:marketId (공개) - 해당 마켓의 평균 별점 / 평가 개수
export async function getMarketReviewSummary(req, res) {
  const { marketId } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
       FROM market_reviews
       WHERE marketId = ?`,
      [marketId]
    );

    const { reviewCount, averageRating } = rows[0];
    return res.status(200).json({
      success: true,
      data: {
        marketId: Number(marketId),
        reviewCount,
        averageRating: averageRating !== null ? Number(averageRating) : null,
      },
      message: '평균 별점을 조회했습니다.',
    });
  } catch (error) {
    console.error('평균 별점 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 평균 별점 조회에 실패했습니다.' });
  }
}


// GET /api/reviews/me/summary (로그인 필요, 주최자 본인)
// [추가] 내가 연 모든 마켓을 통틀어 평균 별점 + 최근 후기 목록을 반환합니다. (마이페이지 프로필용)
export async function getHostReviewSummary(req, res) {
  const { userId } = req.user;

  try {
    const [[summary]] = await pool.query(
      `SELECT COUNT(*) AS reviewCount, ROUND(AVG(r.rating), 1) AS averageRating
       FROM market_reviews r
       JOIN markets m ON m.marketId = r.marketId
       WHERE m.hostId = ?`,
      [userId]
    );

    const [reviews] = await pool.query(
      `SELECT r.reviewId, r.rating, r.comment, r.createdAt, m.title AS marketTitle
       FROM market_reviews r
       JOIN markets m ON m.marketId = r.marketId
       WHERE m.hostId = ?
       ORDER BY r.createdAt DESC
       LIMIT 20`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: {
        reviewCount: summary.reviewCount,
        averageRating: summary.averageRating !== null ? Number(summary.averageRating) : null,
        reviews,
      },
      message: '내 평가 요약을 조회했습니다.',
    });
  } catch (error) {
    console.error('주최자 평가 요약 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 평가 요약 조회에 실패했습니다.' });
  }
}