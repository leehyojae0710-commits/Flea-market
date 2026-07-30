// backend/controllers/commentController.js
// 담당 D: 댓글 (공고/판매자 페이지 공용)
//
// [비공개 댓글 보완] 변경점
//   1) comments.visibility / comments.counterpartId 사용
//        public      : 모두 공개
//        host_only   : 판매자가 작성 -> 작성자 + 주최자만 열람 ("주최자만 볼 수 있는 댓글입니다.")
//        seller_only : 주최자가 작성 -> 작성자(주최자) + counterpartId 판매자만 열람
//                      ("판매자만 볼 수 있는 댓글입니다.")
//   2) 목록 조회 시 열람 권한이 없으면 "마스킹"해서 내려보냅니다.
//      - 댓글 자리(작성자/작성시각/스레드 위치)는 남기고 content 를 null 로 제거
//      - counterpartId 도 제거 (주최자가 '누구에게' 비공개 답글을 달았는지 노출 방지)
//      - 프론트에서 숨기는 방식은 응답에 원문이 남아 개발자도구로 뚫립니다
//   3) 비공개 댓글의 답글은 부모의 열람 대상(작성자+상대방)을 그대로 상속
//      -> 스레드 중간부터 새어 나가는 경우를 막습니다.
//      마스킹 방식이라 부모 자리가 남으므로 답글이 고아가 되지 않습니다.
//   4) 주최자가 "본인 댓글"에 다는 댓글/답글은 비공개 옵션 자체를 허용하지 않음
//   5) [호환] visibility/counterpartId 컬럼이 아직 없는 DB(마이그레이션 미실행)에서는
//      기존 동작(전체 공개)으로 자동 강등됩니다. 팀원이 pull 만 받고 마이그레이션을
//      안 돌렸을 때 댓글 등록 자체가 깨지는 것을 막기 위한 안전장치입니다.

import pool from '../config/db.js';

export const VISIBILITY = {
  PUBLIC: 'public',
  HOST_ONLY: 'host_only',
  SELLER_ONLY: 'seller_only',
};

const ALLOWED_VISIBILITY = Object.values(VISIBILITY);

// ---------- 스키마 호환 체크 ----------
// migrate-add-comment-visibility.js 를 아직 실행하지 않은 DB 대응.
// 한 번 확인한 뒤 캐시하므로 요청마다 information_schema 를 때리지 않습니다.
let visibilitySupported = null;

async function hasVisibilityColumns() {
  if (visibilitySupported !== null) return visibilitySupported;
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'comments'
         AND column_name IN ('visibility', 'counterpartId')`
    );
    visibilitySupported = Number(rows[0].cnt) === 2;
  } catch (error) {
    console.error('댓글 공개범위 컬럼 확인 실패(공개 모드로 동작):', error.message);
    visibilitySupported = false;
  }
  if (!visibilitySupported) {
    console.warn(
      '[comments] visibility/counterpartId 컬럼이 없어 비공개 댓글 기능이 비활성화됩니다. ' +
      'backend 에서 `node scripts/migrate-add-comment-visibility.js` 를 실행해 주세요.'
    );
  }
  return visibilitySupported;
}

/** targetType/targetId 에 해당하는 주최자 userId. 판정 불가하면 null */
async function findHostId(targetType, targetId) {
  if (targetType !== 'market') return null;
  try {
    const [rows] = await pool.query('SELECT hostId FROM markets WHERE marketId = ?', [targetId]);
    return rows.length ? Number(rows[0].hostId) : null;
  } catch (error) {
    console.error('주최자 조회 오류:', error.message);
    return null;
  }
}

/** 이 댓글을 볼 수 있는 사람 집합. 공개 댓글이면 null(=제한 없음) */
function audienceOf(comment, hostId) {
  const visibility = comment.visibility || VISIBILITY.PUBLIC;
  if (visibility === VISIBILITY.HOST_ONLY) {
    return new Set([Number(comment.userId), hostId].filter((v) => v !== null && v !== undefined));
  }
  if (visibility === VISIBILITY.SELLER_ONLY) {
    return new Set(
      [Number(comment.userId), Number(comment.counterpartId)].filter((v) => Number.isFinite(v))
    );
  }
  return null;
}

/**
 * 열람 권한이 없는 댓글을 껍데기만 남겨 반환합니다.
 * 화면에는 "주최자만 볼 수 있는 댓글 입니다." 같은 안내만 뜹니다.
 */
function maskComment(c) {
  return {
    commentId: c.commentId,
    targetType: c.targetType,
    targetId: c.targetId,
    userId: c.userId,
    nickname: c.nickname,
    parentId: c.parentId,
    visibility: c.visibility,
    createdAt: c.createdAt,
    content: null,        // 본문 제거
    counterpartId: null,  // 대상 판매자 제거
    masked: true,
  };
}

/** viewerId 가 이 댓글을 볼 수 있는지 */
function canView(comment, viewerId, hostId) {
  const audience = audienceOf(comment, hostId);
  if (!audience) return true;              // 공개 댓글
  if (!Number.isFinite(viewerId)) return false; // 비로그인은 비공개 댓글 열람 불가
  return audience.has(viewerId);
}

// POST /api/comments (로그인 필요)
export async function createComment(req, res) {
  const { userId } = req.user;
  const viewerId = Number(userId);
  const { targetType, targetId, content, parentId } = req.body;
  const requestedVisibility = String(req.body.visibility || VISIBILITY.PUBLIC);

  if (!targetType || !targetId || !content) {
    return res.status(400).json({ success: false, data: null, message: 'targetType, targetId, content는 필수입니다.' });
  }
  if (!ALLOWED_VISIBILITY.includes(requestedVisibility)) {
    return res.status(400).json({ success: false, data: null, message: '허용되지 않은 공개범위입니다.' });
  }

  try {
    const supported = await hasVisibilityColumns();

    // --- 마이그레이션 전 DB: 기존 스키마 그대로 등록 (전체 공개) ---
    if (!supported) {
      if (parentId) {
        const [parentRows] = await pool.query(
          `SELECT commentId FROM comments WHERE commentId = ? AND targetType = ? AND targetId = ?`,
          [parentId, targetType, targetId]
        );
        if (parentRows.length === 0) {
          return res.status(400).json({ success: false, data: null, message: '답글을 달 원본 댓글을 찾을 수 없습니다.' });
        }
      }
      const [legacy] = await pool.query(
        `INSERT INTO comments (targetType, targetId, userId, content, parentId) VALUES (?, ?, ?, ?, ?)`,
        [targetType, targetId, viewerId, content, parentId || null]
      );
      return res.status(201).json({
        success: true,
        data: {
          commentId: legacy.insertId,
          targetType,
          targetId,
          userId: viewerId,
          content,
          parentId: parentId || null,
          visibility: VISIBILITY.PUBLIC,
          counterpartId: null,
        },
        message: parentId ? '답글이 등록되었습니다.' : '댓글이 등록되었습니다.',
      });
    }

    const hostId = await findHostId(targetType, targetId);
    const isHost = hostId !== null && hostId === viewerId;

    // parentId가 있으면 대댓글: 부모 댓글이 실제로 존재하고, 같은 targetType/targetId에 속하는지 확인
    let parent = null;
    if (parentId) {
      const [parentRows] = await pool.query(
        `SELECT commentId, userId, visibility, counterpartId
           FROM comments
          WHERE commentId = ? AND targetType = ? AND targetId = ?`,
        [parentId, targetType, targetId]
      );
      if (parentRows.length === 0) {
        return res.status(400).json({ success: false, data: null, message: '답글을 달 원본 댓글을 찾을 수 없습니다.' });
      }
      parent = parentRows[0];
    }

    let visibility = VISIBILITY.PUBLIC;
    let counterpartId = null;

    const parentVisibility = parent ? (parent.visibility || VISIBILITY.PUBLIC) : VISIBILITY.PUBLIC;

    if (parent && parentVisibility !== VISIBILITY.PUBLIC) {
      // --- 비공개 스레드: 참여자만 답글 가능하고, 공개범위는 자동 상속 ---
      const audience = audienceOf(parent, hostId);
      if (!audience || !audience.has(viewerId)) {
        return res.status(403).json({ success: false, data: null, message: '비공개 댓글에는 열람 권한이 있는 사람만 답글을 달 수 있습니다.' });
      }
      if (isHost) {
        const seller = [...audience].find((id) => id !== hostId);
        if (seller === undefined) {
          return res.status(400).json({ success: false, data: null, message: '답글 대상 판매자를 확인할 수 없습니다.' });
        }
        visibility = VISIBILITY.SELLER_ONLY;
        counterpartId = seller;
      } else {
        visibility = VISIBILITY.HOST_ONLY;
        counterpartId = null;
      }
    } else if (requestedVisibility === VISIBILITY.HOST_ONLY) {
      // --- 판매자가 "주최자 외 비공개"로 작성 ---
      if (hostId === null) {
        return res.status(400).json({ success: false, data: null, message: '이 게시물에는 비공개 댓글을 사용할 수 없습니다.' });
      }
      if (isHost) {
        return res.status(400).json({ success: false, data: null, message: '주최자는 「주최자 외 비공개」를 사용할 수 없습니다.' });
      }
      visibility = VISIBILITY.HOST_ONLY;
      counterpartId = null;
    } else if (requestedVisibility === VISIBILITY.SELLER_ONLY) {
      // --- 주최자가 판매자 댓글에 "판매자 외 비공개"로 답글 ---
      if (!isHost) {
        return res.status(403).json({ success: false, data: null, message: '「판매자 외 비공개」는 주최자만 사용할 수 있습니다.' });
      }
      if (!parent) {
        return res.status(400).json({ success: false, data: null, message: '「판매자 외 비공개」는 판매자 댓글의 답글에만 사용할 수 있습니다.' });
      }
      if (Number(parent.userId) === hostId) {
        return res.status(400).json({ success: false, data: null, message: '본인이 작성한 댓글에는 비공개 답글을 달 수 없습니다.' });
      }
      visibility = VISIBILITY.SELLER_ONLY;
      counterpartId = Number(parent.userId);
    }

    const [result] = await pool.query(
      `INSERT INTO comments (targetType, targetId, userId, content, parentId, visibility, counterpartId)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [targetType, targetId, viewerId, content, parentId || null, visibility, counterpartId]
    );

    return res.status(201).json({
      success: true,
      data: {
        commentId: result.insertId,
        targetType,
        targetId,
        userId: viewerId,
        content,
        parentId: parentId || null,
        visibility,
        counterpartId,
      },
      message: parentId ? '답글이 등록되었습니다.' : '댓글이 등록되었습니다.',
    });
  } catch (error) {
    console.error('댓글 등록 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 댓글 등록에 실패했습니다.' });
  }
}

// GET /api/comments?targetType=&targetId=   (optionalAuth: 로그인하면 비공개 댓글도 판정)
export async function getCommentList(req, res) {
  const { targetType, targetId } = req.query;
  const viewerId = req.user ? Number(req.user.userId) : null;

  if (!targetType || !targetId) {
    return res.status(400).json({ success: false, data: null, message: 'targetType, targetId 쿼리 파라미터는 필수입니다.' });
  }

  try {
    const supported = await hasVisibilityColumns();
    const hostId = await findHostId(targetType, targetId);

    const [rows] = await pool.query(
      `SELECT c.*, u.nickname
       FROM comments c
       JOIN users u ON u.userId = c.userId
       WHERE c.targetType = ? AND c.targetId = ?
       ORDER BY c.createdAt ASC`,
      [targetType, targetId]
    );

    // 권한이 없으면 제거하지 않고 마스킹합니다.
    // 댓글 자리가 남아 있어야 대화 흐름이 끊기지 않고, 답글도 고아가 되지 않습니다.
    // 마이그레이션 전 DB 는 전부 공개 댓글이므로 그대로 내려보냅니다.
    const list = supported
      ? rows.map((c) => (canView(c, viewerId, hostId) ? { ...c, masked: false } : maskComment(c)))
      : rows.map((c) => ({ ...c, masked: false }));

    return res.status(200).json({
      success: true,
      data: list,
      meta: {
        hostId,
        viewerId,
        isHost: hostId !== null && hostId === viewerId,
        privacySupported: supported,
      },
      message: '댓글 목록을 조회했습니다.',
    });
  } catch (error) {
    console.error('댓글 목록 조회 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 댓글 목록 조회에 실패했습니다.' });
  }
}

// PATCH /api/comments/:commentId (로그인 필요, 본인 댓글만)
export async function updateComment(req, res) {
  const { commentId } = req.params;
  const { userId } = req.user;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, data: null, message: 'content는 필수입니다.' });
  }

  try {
    const [rows] = await pool.query('SELECT userId FROM comments WHERE commentId = ?', [commentId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '존재하지 않는 댓글입니다.' });
    }
    if (rows[0].userId !== userId) {
      return res.status(403).json({ success: false, data: null, message: '본인이 작성한 댓글만 수정할 수 있습니다.' });
    }

    await pool.query(
      'UPDATE comments SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE commentId = ?',
      [content.trim(), commentId]
    );

    return res.status(200).json({
      success: true,
      data: { commentId: Number(commentId), content: content.trim() },
      message: '댓글이 수정되었습니다.',
    });
  } catch (error) {
    console.error('댓글 수정 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 댓글 수정에 실패했습니다.' });
  }
}
