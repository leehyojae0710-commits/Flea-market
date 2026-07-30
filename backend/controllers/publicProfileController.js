// backend/controllers/publicProfileController.js
// [신규] 다른 사람의 프로필을 열람하기 위한 공개 조회 컨트롤러.
//
// 왜 필요한가
//   기존에는 /api/users/me/profile(본인) 만 있어서, 마켓 상세에서 주최자를 보거나
//   신청자 목록에서 판매자를 확인할 방법이 없었습니다.
//
// 공개 범위
//   닉네임 / 프로필 사진 / 한 줄 소개 / 소개글 / 소개 이미지 / 역할 + 역할별 활동 요약 + 평가 요약
//   이메일·전화번호·거주지역 등 연락처와 개인정보는 절대 내보내지 않습니다.

import pool from '../config/db.js';

// GET /api/profiles/:userId  (로그인 불필요)
export async function getPublicProfile(req, res) {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, data: null, message: '올바르지 않은 사용자 번호입니다.' });
  }

  try {
    // 1) 기본 프로필 (공개해도 되는 컬럼만 고릅니다. email/phone/region 제외)
    const [rows] = await pool.query(
      `SELECT userId, userType, nickname, profileImage, introText, bioText, bioImage
       FROM users WHERE userId = ?`,
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '사용자를 찾을 수 없습니다.' });
    }

    const profile = rows[0];
    const isHost = Number(profile.userType) === 1;

    // 2) 역할별 활동 요약
    let stats;
    let review;

    if (isHost) {
      // 주최자: 진행중/예정 · 지난 행사 · 취소 이력
      const [[counts]] = await pool.query(
        `SELECT
           SUM(CASE WHEN isExpired = 0 THEN 1 ELSE 0 END) AS upcomingCount,
           SUM(CASE WHEN isExpired = 1 THEN 1 ELSE 0 END) AS pastCount,
           SUM(CASE WHEN isExpired = 2 THEN 1 ELSE 0 END) AS cancelledCount
         FROM markets WHERE hostId = ?`,
        [userId]
      );
      stats = {
        upcomingCount: Number(counts?.upcomingCount) || 0,
        pastCount: Number(counts?.pastCount) || 0,
        cancelledCount: Number(counts?.cancelledCount) || 0,
      };

      // 판매자들이 이 주최자의 마켓에 남긴 평가 (reviewController.getHostReviewSummary 와 같은 기준)
      const [[summary]] = await pool.query(
        `SELECT COUNT(*) AS reviewCount, ROUND(AVG(r.rating), 1) AS averageRating
         FROM market_reviews r
         JOIN markets m ON m.marketId = r.marketId
         WHERE m.hostId = ?`,
        [userId]
      );
      review = {
        reviewCount: Number(summary?.reviewCount) || 0,
        averageRating: summary?.averageRating !== null && summary?.averageRating !== undefined
          ? Number(summary.averageRating)
          : null,
      };
    } else {
      // 판매자: 참여 마켓(결제 완료 기준) · 받은 후기
      const [[participated]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM applications WHERE sellerId = ? AND status = 'Paid'`,
        [userId]
      );
      stats = { participatedCount: Number(participated?.cnt) || 0 };

      const [[summary]] = await pool.query(
        `SELECT COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS averageRating
         FROM seller_reviews WHERE sellerId = ?`,
        [userId]
      );
      review = {
        reviewCount: Number(summary?.reviewCount) || 0,
        averageRating: summary?.averageRating !== null && summary?.averageRating !== undefined
          ? Number(summary.averageRating)
          : null,
      };
      stats.reviewCount = review.reviewCount;
    }

    return res.status(200).json({
      success: true,
      data: {
        userId: profile.userId,
        userType: profile.userType,
        role: isHost ? 'host' : 'seller',
        nickname: profile.nickname,
        profileImage: profile.profileImage,
        introText: profile.introText,
        bioText: profile.bioText,
        bioImage: profile.bioImage,
        stats,
        review,
      },
      message: '프로필을 조회했습니다.',
    });
  } catch (error) {
    console.error('공개 프로필 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 프로필 조회에 실패했습니다.' });
  }
}

// GET /api/profiles/:userId/reviews  (로그인 불필요)
// [추가] 프로필 화면 하단의 평가 목록. 최신 20건만 돌려줍니다.
export async function getPublicProfileReviews(req, res) {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, data: null, message: '올바르지 않은 사용자 번호입니다.' });
  }

  try {
    const [rows] = await pool.query('SELECT userType FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '사용자를 찾을 수 없습니다.' });
    }

    const isHost = Number(rows[0].userType) === 1;

    const [reviews] = isHost
      ? await pool.query(
          `SELECT r.reviewId, r.rating, r.comment, r.createdAt, m.title AS marketTitle
           FROM market_reviews r
           JOIN markets m ON m.marketId = r.marketId
           WHERE m.hostId = ?
           ORDER BY r.createdAt DESC
           LIMIT 20`,
          [userId]
        )
      : await pool.query(
          `SELECT sr.reviewId, sr.rating, sr.comment, sr.createdAt, m.title AS marketTitle
           FROM seller_reviews sr
           JOIN markets m ON m.marketId = sr.marketId
           WHERE sr.sellerId = ?
           ORDER BY sr.createdAt DESC
           LIMIT 20`,
          [userId]
        );

    return res.status(200).json({
      success: true,
      data: { role: isHost ? 'host' : 'seller', reviews },
      message: '평가 목록을 조회했습니다.',
    });
  } catch (error) {
    console.error('공개 프로필 평가 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 평가 조회에 실패했습니다.' });
  }
}
