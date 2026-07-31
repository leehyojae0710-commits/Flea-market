// backend/utills/duplicateApplication.js
// [중복 부스 신청 안내 - 신규 파일]
//
// 담는 것: "같은 판매자가 같은 마켓에 부스를 2개 이상 신청했는가" 판정 한 곳.
//
// 왜 만들었나
//   확정 정책상 1인 다부스 신청은 "허용"입니다. (applicationPolicy.js 도 막지 않습니다.)
//   그래서 막을 수는 없지만, 아래 두 사람은 그 사실을 알아야 합니다.
//     - 판매자: 실수로 같은 마켓에 여러 번 신청했는지 스스로 확인
//     - 주최자: 한 판매자가 부스를 여러 칸 가져간 것을 승인 전에 인지
//   판정 기준이 화면마다 다르면 "판매자 화면엔 3건인데 주최자 화면엔 5건" 같은 일이 생기므로
//   세는 규칙을 이 파일 하나로 모읍니다.
//
// 세는 기준
//   applicationPolicy 의 ACTIVE_APPLICATION_STATUSES(Pending/Approved/Paid)와 동일합니다.
//   즉 "지금 부스를 점유하고 있는 신청"만 셉니다. 반려(Rejected)·환불완료(Refunded)는
//   부스를 놓은 상태이므로 중복으로 세지 않습니다. (모집 현황 게이지 숫자와도 일치)
//
// 관련 WBS
//   3.2.2.4 중복 신청 확인 (기존에는 "같은 부스 재신청"만 막고, 마켓 단위 중복은 아무도 몰랐음)

import { ACTIVE_APPLICATION_STATUSES } from './applicationPolicy.js';

/** 중복으로 세는 신청 상태. 모집 현황 게이지 / 정원 계산과 같은 기준입니다. */
export const DUPLICATE_COUNT_STATUSES = ACTIVE_APPLICATION_STATUSES;

const PLACEHOLDERS = DUPLICATE_COUNT_STATUSES.map(() => '?').join(', ');

/** 이 신청이 부스를 점유 중(=중복 계산 대상)인지 */
export function isCountedStatus(status) {
  return DUPLICATE_COUNT_STATUSES.includes(status || 'Pending');
}

/** 부스 번호를 보기 좋은 문자열로 (없으면 '-') */
function boothLabel(value) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  return s === '' ? '-' : s;
}

/* ------------------------------------------------------------------ */
/* 1) DB 직접 조회 — 신청 직전 / 신청 직후에 사용                       */
/* ------------------------------------------------------------------ */

/**
 * 특정 판매자가 특정 마켓에 몇 건이나 신청 중인지 조회합니다.
 *
 * @param db  pool 또는 트랜잭션 커넥션
 * @param opts.marketId
 * @param opts.sellerId
 * @param opts.excludeApplicationId  방금 만든 건을 빼고 "이전에 몇 건 있었는지" 볼 때 사용
 * @returns {Promise<{count:number, booths:string[], applicationIds:number[], isDuplicate:boolean}>}
 */
export async function getSellerDuplicateState(db, {
  marketId,
  sellerId,
  excludeApplicationId = null,
} = {}) {
  const excludeSql = excludeApplicationId ? ' AND applicationId <> ?' : '';
  const excludeParam = excludeApplicationId ? [excludeApplicationId] : [];

  const [rows] = await db.query(
    `SELECT applicationId, boothNumber, status
       FROM applications
      WHERE marketId = ? AND sellerId = ? AND status IN (${PLACEHOLDERS})${excludeSql}
      ORDER BY applicationId ASC`,
    [marketId, sellerId, ...DUPLICATE_COUNT_STATUSES, ...excludeParam]
  );

  return {
    count: rows.length,
    booths: rows.map((r) => boothLabel(r.boothNumber)),
    applicationIds: rows.map((r) => Number(r.applicationId)),
    isDuplicate: rows.length >= 2,
  };
}

/* ------------------------------------------------------------------ */
/* 2) 목록에 붙이기 — 이미 받아온 배열 안에서 계산 (추가 쿼리 없음)      */
/* ------------------------------------------------------------------ */

/**
 * (marketId, sellerId) 조합별로 점유 중인 신청을 모아 둡니다.
 * 목록 API 는 이미 필요한 행을 전부 들고 있으므로, 서브쿼리를 더 붙이지 않고
 * 자바스크립트에서 한 번 훑어 계산합니다. (행 수가 수천 건이어도 O(n))
 */
function buildGroupMap(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    if (!isCountedStatus(row.status)) continue;
    const key = keyOf(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(boothLabel(row.boothNumber));
  }
  return map;
}

/**
 * [주최자 화면] 신청자 목록의 각 행에 "이 판매자가 이 마켓에 몇 건 신청했는지"를 붙입니다.
 *   sellerDuplicateCount  : 점유 중인 신청 건수 (1이면 중복 아님)
 *   sellerDuplicateBooths : 그 판매자가 잡고 있는 부스 번호들
 *   isDuplicateSeller     : 2건 이상인지
 *
 * 반려/환불 건에도 필드를 붙이되, 그 건 자체는 카운트에 들어가지 않습니다.
 * (주최자가 "반려된 건인데 이 판매자는 아직 3칸 갖고 있음"을 볼 수 있어야 하므로)
 */
export function attachDuplicateToMarketApplications(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const map = buildGroupMap(rows, (r) => String(r.sellerId));

  return rows.map((row) => {
    const booths = map.get(String(row.sellerId)) || [];
    return {
      ...row,
      sellerDuplicateCount: booths.length,
      sellerDuplicateBooths: booths,
      isDuplicateSeller: booths.length >= 2,
    };
  });
}

/**
 * [판매자 화면] 내 부스 목록의 각 행에 "이 마켓에 내가 몇 건 신청했는지"를 붙입니다.
 *   marketDuplicateCount  / marketDuplicateBooths / isDuplicateInMarket
 */
export function attachDuplicateToMyApplications(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const map = buildGroupMap(rows, (r) => String(r.marketId));

  return rows.map((row) => {
    const booths = map.get(String(row.marketId)) || [];
    return {
      ...row,
      marketDuplicateCount: booths.length,
      marketDuplicateBooths: booths,
      isDuplicateInMarket: booths.length >= 2,
    };
  });
}

/**
 * 주최자 화면 상단 요약용. attachDuplicateToMarketApplications 를 거친 배열을 넣습니다.
 * @returns {{duplicateSellers:number, duplicateApplications:number}}
 *   duplicateSellers      : 부스를 2칸 이상 잡은 판매자 수
 *   duplicateApplications : 그 판매자들이 잡고 있는 신청 건수 합
 */
export function summarizeDuplicates(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { duplicateSellers: 0, duplicateApplications: 0 };
  }
  const seen = new Map();
  for (const row of rows) {
    const count = Number(row.sellerDuplicateCount) || 0;
    if (count >= 2) seen.set(String(row.sellerId), count);
  }
  let applications = 0;
  for (const count of seen.values()) applications += count;
  return { duplicateSellers: seen.size, duplicateApplications: applications };
}

/** 알림/안내 문구에 쓸 부스 목록 문자열. 너무 길어지지 않게 5개까지만 보여줍니다. */
export function formatBoothList(booths, max = 5) {
  if (!Array.isArray(booths) || booths.length === 0) return '';
  const head = booths.slice(0, max).map((b) => `${b}번`).join(', ');
  return booths.length > max ? `${head} 외 ${booths.length - max}건` : head;
}

export default {
  DUPLICATE_COUNT_STATUSES,
  isCountedStatus,
  getSellerDuplicateState,
  attachDuplicateToMarketApplications,
  attachDuplicateToMyApplications,
  summarizeDuplicates,
  formatBoothList,
};
