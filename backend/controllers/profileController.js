// backend/controllers/profileController.js
// [신규] 마이페이지 "프로필 보기" 화면 전용 컨트롤러
// - 기존 userRoutes.js(/users/me PATCH·DELETE, /users/me/password)는 건드리지 않고
//   완전히 새로운 엔드포인트(/users/me/profile, /users/me/stats)로 분리했습니다.

import pool from '../config/db.js';

// GET /api/users/me/profile (로그인 필요)
// [추가] 프로필 화면에 필요한 정보(닉네임/프로필사진/한줄소개/소개글/소개이미지 등)를 조회합니다.
export async function getMyProfile(req, res) {
  const { userId } = req.user;

  try {
    const [rows] = await pool.query(
      `SELECT userId, userType, email, nickname, profileImage, introText, bioText, bioImage
       FROM users WHERE userId = ?`,
      [userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '사용자를 찾을 수 없습니다.' });
    }
    return res.status(200).json({ success: true, data: rows[0], message: '프로필을 조회했습니다.' });
  } catch (error) {
    console.error('프로필 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 프로필 조회에 실패했습니다.' });
  }
}

// PATCH /api/users/me/profile (로그인 필요)
// [추가] 닉네임 / 한 줄 소개 / 소개글을 수정합니다.
// 이미지(profileImage, bioImage)는 /api/upload/profile-image, /api/upload/bio-image 로
// 먼저 업로드해서 받은 경로 문자열을 그대로 body에 담아 보내는 방식입니다.
// (marketImage / itemImage와 동일한 "먼저 업로드 -> 경로를 PATCH로 저장" 패턴)
export async function updateMyProfile(req, res) {
  const { userId } = req.user;
  const { nickname, introText, bioText, profileImage, bioImage } = req.body;

  const fields = [];
  const values = [];
  if (nickname !== undefined) { fields.push('nickname = ?'); values.push(nickname || null); }
  if (introText !== undefined) { fields.push('introText = ?'); values.push(introText || null); }
  if (bioText !== undefined) { fields.push('bioText = ?'); values.push(bioText || null); }
  if (profileImage !== undefined) { fields.push('profileImage = ?'); values.push(profileImage || null); }
  if (bioImage !== undefined) { fields.push('bioImage = ?'); values.push(bioImage || null); }

  if (fields.length === 0) {
    return res.status(400).json({ success: false, data: null, message: '수정할 내용이 없습니다.' });
  }

  try {
    values.push(userId);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE userId = ?`, values);

    const [rows] = await pool.query(
      `SELECT userId, userType, email, nickname, profileImage, introText, bioText, bioImage
       FROM users WHERE userId = ?`,
      [userId]
    );
    return res.status(200).json({ success: true, data: rows[0], message: '프로필이 수정되었습니다.' });
  } catch (error) {
    console.error('프로필 수정 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 프로필 수정에 실패했습니다.' });
  }
}

// GET /api/users/me/stats (로그인 필요)
// [추가] 마이페이지 "행사 현황" 숫자 3개를 계산합니다.
//   - 주최자(userType=1): 진행중/예정 = isExpired=0 인 내 마켓 수, 지난 행사 = isExpired=1(마감)인 내 마켓 수
//     취소 이력 = isExpired=2(주최자가 "삭제하기"로 지운) 인 내 마켓 수
//   - 판매자(userType=0): 진행중/예정 = 마감 안 된 마켓에 Pending/Approved로 신청한 건수
//     지난 행사 = 마감된 마켓에 Approved로 신청했던 건수, 취소 이력 = Rejected(반려)된 신청 건수
export async function getMyEventStats(req, res) {
  const { userId, userType } = req.user;

  try {
    if (Number(userType) === 1) {
      const [[upcoming]] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM markets WHERE hostId = ? AND isExpired = 0',
        [userId]
      );
      const [[past]] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM markets WHERE hostId = ? AND isExpired = 1',
        [userId]
      );
      const [[cancelled]] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM markets WHERE hostId = ? AND isExpired = 2',
        [userId]
      );
      return res.status(200).json({
        success: true,
        data: { upcomingCount: upcoming.cnt, pastCount: past.cnt, cancelledCount: cancelled.cnt },
        message: '행사 현황을 조회했습니다.',
      });
    }

    const [[upcoming]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.sellerId = ? AND m.isExpired = 0 AND a.status IN ('Pending', 'Approved')`,
      [userId]
    );
    const [[past]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       WHERE a.sellerId = ? AND m.isExpired = 1 AND a.status = 'Approved'`,
      [userId]
    );
    const [[cancelled]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM applications WHERE sellerId = ? AND status = 'Rejected'`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: { upcomingCount: upcoming.cnt, pastCount: past.cnt, cancelledCount: cancelled.cnt },
      message: '행사 현황을 조회했습니다.',
    });
  } catch (error) {
    console.error('행사 현황 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 행사 현황 조회에 실패했습니다.' });
  }
}
