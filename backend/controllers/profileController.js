// backend/controllers/profileController.js
// [신규] 마이페이지 "프로필 보기" 화면 전용 컨트롤러
// - 기존 userRoutes.js(/users/me PATCH·DELETE, /users/me/password)는 건드리지 않고
//   완전히 새로운 엔드포인트(/users/me/profile, /users/me/stats)로 분리했습니다.

import pool from '../config/db.js';
// [닉네임] 회원가입과 같은 규칙(형식/예약어/중복)을 프로필 수정에도 적용합니다.
import { validateNickname, isNicknameTaken, isDuplicateKeyError } from '../utills/nicknamePolicy.js';

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

  // [수정] 기존에는 닉네임을 검증 없이 그대로 UPDATE 했습니다.
  //        회원가입에서 중복을 막아도 이 API로 남의 닉네임과 똑같이 바꿀 수 있었으므로,
  //        형식 검증 + 중복 검사(본인 제외)를 여기서도 수행합니다.
  let nextNickname = null;
  if (nickname !== undefined) {
    const check = validateNickname(nickname);
    if (!check.ok) {
      return res.status(400).json({ success: false, data: null, message: check.message });
    }
    nextNickname = check.nickname;
    fields.push('nickname = ?');
    values.push(nextNickname);
  }
  if (introText !== undefined) { fields.push('introText = ?'); values.push(introText || null); }
  if (bioText !== undefined) { fields.push('bioText = ?'); values.push(bioText || null); }
  if (profileImage !== undefined) { fields.push('profileImage = ?'); values.push(profileImage || null); }
  if (bioImage !== undefined) { fields.push('bioImage = ?'); values.push(bioImage || null); }

  if (fields.length === 0) {
    return res.status(400).json({ success: false, data: null, message: '수정할 내용이 없습니다.' });
  }

  try {
    // 본인이 지금 쓰는 닉네임을 그대로 저장하는 것은 허용해야 하므로 userId 를 제외하고 검사합니다.
    if (nextNickname && (await isNicknameTaken(pool, nextNickname, userId))) {
      return res.status(409).json({ success: false, data: null, message: '이미 사용 중인 닉네임입니다.' });
    }

    values.push(userId);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE userId = ?`, values);

    const [rows] = await pool.query(
      `SELECT userId, userType, email, nickname, profileImage, introText, bioText, bioImage
       FROM users WHERE userId = ?`,
      [userId]
    );
    return res.status(200).json({ success: true, data: rows[0], message: '프로필이 수정되었습니다.' });
  } catch (error) {
    // 동시에 같은 닉네임으로 수정 요청이 들어온 경우 (users.nickname UNIQUE 인덱스가 최종 방어선)
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ success: false, data: null, message: '이미 사용 중인 닉네임입니다.' });
    }
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

  // [수정] 주최자 계정은 "판매자 모드"로도 마이페이지를 볼 수 있습니다.
  //        따라서 계정 종류(userType)가 아니라 화면 모드(role 쿼리)를 기준으로 통계를 나눕니다.
  //          role=host   -> 주최 행사 현황 (주최자 계정만 가능)
  //          role=seller -> 참여 이력 (주최자 계정이 판매자 모드로 볼 때도 여기)
  //          role 없음   -> 예전처럼 계정 종류를 그대로 따름 (기존 호출 하위 호환)
  const accountIsHost = Number(userType) === 1;
  const requestedRole = String(req.query.role || '').toLowerCase();

  if (requestedRole === 'host' && !accountIsHost) {
    return res.status(403).json({
      success: false,
      data: null,
      message: '주최자만 조회할 수 있습니다.',
    });
  }

  const viewAsHost =
    requestedRole === 'host' ? true : requestedRole === 'seller' ? false : accountIsHost;

  try {
    if (viewAsHost) {
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

    // [판매자 모드] 참여 마켓 = 결제 완료(Paid) 건수, 받은 후기 = 주최자에게 받은 평가 건수
    // 주최자 계정이 판매자 모드로 볼 때도 같은 쿼리를 그대로 씁니다.
    const [[participated]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM applications WHERE sellerId = ? AND status = 'Paid'`,
      [userId]
    );
    const [[reviewCount]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM seller_reviews WHERE sellerId = ?`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      data: { participatedCount: participated.cnt, reviewCount: reviewCount.cnt },
      message: '참여 이력을 조회했습니다.',
    });

  } catch (error) {
    console.error('행사 현황 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 행사 현황 조회에 실패했습니다.' });
  }
}

// GET /api/users/me/activity (로그인 필요, 주최자 전용)
// [추가] WBS 3.1.5.2 - 마이페이지 "활동 현황" 분포 도넛 차트용 집계.
// 기존 /users/me/stats(진행중·지난·취소 3숫자)는 그대로 두고, 도넛 전용 엔드포인트를 따로 만들었습니다.
//
// 상태 분류(서로 겹치지 않게 4개로 나눕니다. 합계 = 내가 등록한 전체 마켓 수)
//   - 취소   : isExpired = 2 (주최자가 삭제/취소한 마켓)
//   - 종료   : isExpired = 1 (마감 처리) 또는 개최 종료일(eventDate_max)이 오늘보다 이전
//   - 모집중 : 취소·종료가 아니면서 오늘이 모집 시작일~모집 마감일 사이
//   - 진행   : 나머지 (모집 시작 전 + 모집 마감 후 개최 대기 + 개최 기간 중)
export async function getMyActivityBreakdown(req, res) {
  const { userId, userType } = req.user;

  // 이 도넛은 "내가 주최한 마켓"의 분포이므로 판매자 계정에는 표시하지 않습니다.
  if (Number(userType) !== 1) {
    return res.status(403).json({
      success: false,
      data: null,
      message: '주최자만 조회할 수 있습니다.',
    });
  }

  try {
    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS totalCount,
         SUM(CASE WHEN isExpired = 2 THEN 1 ELSE 0 END) AS cancelledCount,
         SUM(CASE
               WHEN isExpired <> 2
                AND (isExpired = 1
                     OR (eventDate_max IS NOT NULL AND eventDate_max < CURDATE()))
               THEN 1 ELSE 0 END) AS closedCount,
         SUM(CASE
               WHEN isExpired = 0
                AND NOT (eventDate_max IS NOT NULL AND eventDate_max < CURDATE())
                AND recruitmentDate_min IS NOT NULL
                AND recruitmentDate_max IS NOT NULL
                AND CURDATE() BETWEEN recruitmentDate_min AND recruitmentDate_max
               THEN 1 ELSE 0 END) AS recruitingCount
       FROM markets
       WHERE hostId = ?`,
      [userId]
    );

    // 마켓이 한 건도 없으면 SUM()이 NULL을 돌려주므로 숫자로 정리합니다.
    const totalCount = Number(row?.totalCount) || 0;
    const cancelledCount = Number(row?.cancelledCount) || 0;
    const closedCount = Number(row?.closedCount) || 0;
    const recruitingCount = Number(row?.recruitingCount) || 0;
    // 나머지를 "진행"으로 계산해 4개 값의 합이 항상 전체와 일치하게 만듭니다.
    const ongoingCount = Math.max(
      totalCount - cancelledCount - closedCount - recruitingCount,
      0
    );

    return res.status(200).json({
      success: true,
      data: { recruitingCount, ongoingCount, closedCount, cancelledCount, totalCount },
      message: '활동 현황 분포를 조회했습니다.',
    });
  } catch (error) {
    console.error('활동 현황 분포 조회 오류:', error.message);
    return res.status(500).json({
      success: false,
      data: null,
      message: '서버 오류로 활동 현황 조회에 실패했습니다.',
    });
  }
}
