// backend/services/notificationService.js
// [추가] 알림(종 버튼) 생성 공통 헬퍼
//
// 신청/승인/반려/결제/환불 등 "본 기능" 도중에 알림을 만들어 붙이는데,
// 알림 생성이 실패했다고 해서 본 기능(결제, 승인 등)까지 실패하면 안 되므로
// 이 헬퍼 내부에서 에러를 잡아 로그만 남기고 항상 조용히 넘어갑니다.
//
// audience: 'host'  -> 종 버튼 클릭 시 "내 마켓 관리"로 이동
//           'seller'-> 종 버튼 클릭 시 "내 부스 관리"로 이동

import pool from '../config/db.js';

/**
 * 알림 1건 생성.
 * @param {object} n
 * @param {number} n.userId       받는 사람 (필수)
 * @param {'host'|'seller'} n.audience
 * @param {string} n.type         알림 종류 (application_received 등)
 * @param {string} n.title
 * @param {string} n.message
 * @param {number|null} [n.marketId]
 * @param {number|null} [n.applicationId]
 */
export async function createNotification(n) {
  if (!n || !n.userId || !n.audience || !n.type || !n.title || !n.message) {
    console.error('[notificationService] 필수 값 누락으로 알림 생성 건너뜀:', n);
    return null;
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO notifications (userId, audience, type, title, message, marketId, applicationId)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        n.userId,
        n.audience,
        n.type,
        n.title,
        n.message,
        n.marketId ?? null,
        n.applicationId ?? null,
      ]
    );
    return result.insertId;
  } catch (error) {
    console.error('[notificationService] 알림 생성 실패(무시하고 진행):', error.message);
    return null;
  }
}

/**
 * 여러 명에게 같은 성격의 알림을 보낼 때 사용 (예: 정산 통보).
 * 한 건이 실패해도 나머지는 계속 시도합니다.
 * @param {Array<object>} list - createNotification 과 동일한 형태의 객체 배열
 */
export async function createNotifications(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const results = [];
  for (const n of list) {
    results.push(await createNotification(n));
  }
  return results;
}
