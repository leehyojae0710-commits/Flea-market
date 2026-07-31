// backend/utills/applicationPolicy.js
// [부스 신청 정합성 - 신규 파일]
//
// 담는 것: "이 사람이 이 마켓의 이 부스에 신청해도 되는가" 판정 한 곳.
//
// 왜 만들었나
//   기존 applyForBooth 는 마켓 존재 여부와 마감 여부만 확인하고 바로 INSERT 했습니다.
//   그래서 아래가 전부 통과됐습니다.
//     - 같은 부스에 여러 명이 신청  (부스 공석 확인 없음)
//     - 같은 사람이 같은 부스에 반복 신청 (중복 확인 없음)
//     - 정원(maxparticipants)을 넘겨서 신청 (정원은 저장만 하고 아무도 읽지 않았음)
//     - 주최자가 자기 마켓에 신청 (기능정의서 확정 정책 위반)
//     - 개최일이 겹치는 다른 마켓에 중복 신청
//   신청 화면과 수정 화면(booth-edit) 두 경로가 있어서, 한쪽만 막으면 다른 쪽으로 우회됩니다.
//   그래서 판정을 이 모듈 하나로 모으고 두 경로가 같이 쓰도록 했습니다.
//
// 관련 WBS
//   3.2.2.4 중복 신청 확인 / 3.2.2.5 부스 공석 여부 확인 / 3.2.2.6 신청 전 자격 검증
//   3.11.6.1 본인 주최 마켓 자기신청 차단 / 3.11.6.2 본인 마켓 예비신청·환불요청 차단
//
// 확정 정책 반영
//   - 1인 다부스 신청 허용 → 정원은 "사람 수"가 아니라 "점유 부스 수" 기준으로 셉니다.
//   - 점유 부스 판정 상태값은 기존 마켓 목록 쿼리와 동일하게 맞췄습니다. (Pending / Approved / Paid)

/** 부스를 점유하고 있다고 보는 신청 상태. marketController 의 appliedBooths 계산과 동일해야 합니다. */
export const ACTIVE_APPLICATION_STATUSES = ['Pending', 'Approved', 'Paid'];

const ACTIVE_LIST = ACTIVE_APPLICATION_STATUSES.map(() => '?').join(', ');

/* ------------------------------------------------------------------ */
/* 스키마 차이 흡수                                                     */
/* ------------------------------------------------------------------ */

// 팀마다 마이그레이션 적용 시점이 달라, 없는 컬럼을 SELECT 하면 신청 자체가 500 으로 죽습니다.
// 한 번만 조회해서 캐시하고, 없는 컬럼에 걸린 검사는 조용히 건너뜁니다.
let marketColumnCache = null;

async function getMarketColumns(db) {
  if (marketColumnCache) return marketColumnCache;
  try {
    const [rows] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'markets'`
    );
    marketColumnCache = new Set(rows.map((r) => r.c));
  } catch (error) {
    marketColumnCache = new Set();
  }
  return marketColumnCache;
}

/** DATE 컬럼을 시간대 영향 없이 'YYYY-MM-DD' 로 만듭니다. (toISOString 은 하루 밀릴 수 있음) */
function toDateKey(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

/* ------------------------------------------------------------------ */
/* 본판정                                                              */
/* ------------------------------------------------------------------ */

/**
 * 부스 신청 자격을 검사합니다.
 *
 * @param db  pool 또는 트랜잭션 커넥션. 신청 등록 시에는 반드시 커넥션을 넘겨 주세요.
 *            (마켓 행을 FOR UPDATE 로 잠가야 동시 신청에서 정원/공석 판정이 어긋나지 않습니다.)
 * @param opts.userId                신청자
 * @param opts.marketId              대상 마켓
 * @param opts.boothNumber           신청 부스 번호
 * @param opts.excludeApplicationId  신청 수정일 때 자기 자신을 검사에서 제외 (없으면 신규 등록)
 * @param opts.lock                  true 면 markets 행을 FOR UPDATE 로 잠급니다. (트랜잭션 안에서만)
 *
 * @returns {Promise<{ok:true, market:object} | {ok:false, status:number, code:string, message:string}>}
 */
export async function checkBoothApplyEligibility(db, {
  userId,
  marketId,
  boothNumber,
  excludeApplicationId = null,
  lock = false,
} = {}) {
  const columns = await getMarketColumns(db);
  const has = (c) => columns.size === 0 || columns.has(c);

  const selectCols = ['marketId', 'hostId', 'isExpired', 'title'];
  for (const c of ['maxparticipants', 'allowOvercapacity', 'eventDate_min', 'eventDate_max', 'recruitmentDate_min', 'recruitmentDate_max']) {
    if (has(c)) selectCols.push(c);
  }

  const [marketRows] = await db.query(
    `SELECT ${selectCols.join(', ')} FROM markets WHERE marketId = ?${lock ? ' FOR UPDATE' : ''}`,
    [marketId]
  );
  if (marketRows.length === 0) {
    return fail(404, 'MARKET_NOT_FOUND', '해당 마켓을 찾을 수 없습니다.');
  }

  const market = marketRows[0];

  // 1) 마켓 상태
  if (Number(market.isExpired) === 2) {
    return fail(409, 'MARKET_CANCELLED', '취소된 마켓입니다.');
  }
  if (Number(market.isExpired) === 1) {
    return fail(409, 'MARKET_CLOSED', '마감된 마켓에는 신청할 수 없습니다.');
  }

  // 2) [3.11.6.1] 본인이 주최한 마켓에는 신청할 수 없습니다. (기능정의서 확정 정책)
  //    화면에서 버튼을 가리는 것만으로는 API 직접 호출을 막을 수 없어 서버에서 검증합니다.
  if (Number(market.hostId) === Number(userId)) {
    return fail(403, 'SELF_APPLY_FORBIDDEN',
      '본인이 주최한 마켓에는 부스를 신청할 수 없습니다.');
  }

  // 3) 모집 기간
  const today = todayKey();
  const openFrom = toDateKey(market.recruitmentDate_min);
  const openTo = toDateKey(market.recruitmentDate_max);
  if (openFrom && today < openFrom) {
    return fail(409, 'RECRUITMENT_NOT_STARTED', `아직 모집 시작 전입니다. (모집 시작 ${openFrom})`);
  }
  if (openTo && today > openTo) {
    return fail(409, 'RECRUITMENT_CLOSED', `모집이 마감되었습니다. (모집 마감 ${openTo})`);
  }

  const excludeSql = excludeApplicationId ? ' AND applicationId <> ?' : '';
  const excludeParam = excludeApplicationId ? [excludeApplicationId] : [];

  // 4) [3.2.2.4 / 3.2.2.5] 부스 점유 확인
  //    같은 부스를 이미 누가 쓰고 있으면 막습니다. 내 신청인지 남의 신청인지에 따라 안내를 나눕니다.
  if (boothNumber !== undefined && boothNumber !== null && String(boothNumber).trim() !== '') {
    const [taken] = await db.query(
      `SELECT applicationId, sellerId FROM applications
        WHERE marketId = ? AND boothNumber = ? AND status IN (${ACTIVE_LIST})${excludeSql}
        LIMIT 1`,
      [marketId, boothNumber, ...ACTIVE_APPLICATION_STATUSES, ...excludeParam]
    );
    if (taken.length > 0) {
      return Number(taken[0].sellerId) === Number(userId)
        ? fail(409, 'DUPLICATE_APPLICATION', `이미 신청한 부스입니다. (${boothNumber}번)`)
        : fail(409, 'BOOTH_TAKEN', `이미 신청된 부스입니다. 다른 부스를 선택해 주세요. (${boothNumber}번)`);
    }
  }

  // 5) 정원 확인 — 1인 다부스를 허용하므로 "점유 부스 수" 로 셉니다.
  //    [초과 신청 허용] 주최자가 markets.allowOvercapacity 를 켜두면, 정원이 차도
  //    행사 시작일(eventDate_min) 전까지는 막지 않습니다. 행사가 시작된 뒤에는
  //    이 값이 켜져 있어도 다시 정원을 지킵니다 — "행사개최전까지" 관리 범위로 한정.
  const capacity = Number(market.maxparticipants);
  if (Number.isFinite(capacity) && capacity > 0) {
    const eventStart = has('eventDate_min') ? toDateKey(market.eventDate_min) : null;
    const beforeEvent = eventStart ? today < eventStart : true;
    const overcapacityAllowed = has('allowOvercapacity') && Number(market.allowOvercapacity) === 1 && beforeEvent;

    if (!overcapacityAllowed) {
      const [[occupied]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM applications
          WHERE marketId = ? AND status IN (${ACTIVE_LIST})${excludeSql}`,
        [marketId, ...ACTIVE_APPLICATION_STATUSES, ...excludeParam]
      );
      if (Number(occupied.cnt) >= capacity) {
        return fail(409, 'CAPACITY_FULL',
          `부스가 모두 찼습니다. (${occupied.cnt}/${capacity})`);
      }
    }
  }

  // 6) [3.2.2.6] 동일 일자 중복 신청 확인
  //    같은 날 두 곳에 나가는 것은 물리적으로 불가능하므로, 개최 기간이 겹치는 다른 마켓은 막습니다.
  const from = toDateKey(market.eventDate_min);
  const to = toDateKey(market.eventDate_max);
  if (from && to && has('eventDate_min') && has('eventDate_max')) {
    const [conflict] = await db.query(
      `SELECT m.marketId, m.title, m.eventDate_min, m.eventDate_max
         FROM applications a
         JOIN markets m ON m.marketId = a.marketId
        WHERE a.sellerId = ?
          AND a.marketId <> ?
          AND a.status IN (${ACTIVE_LIST})
          AND m.isExpired <> 2
          AND m.eventDate_min <= ?
          AND m.eventDate_max >= ?
          ${excludeApplicationId ? 'AND a.applicationId <> ?' : ''}
        LIMIT 1`,
      [userId, marketId, ...ACTIVE_APPLICATION_STATUSES, to, from, ...excludeParam]
    );
    if (conflict.length > 0) {
      const other = conflict[0];
      return fail(409, 'DATE_CONFLICT',
        `개최일이 겹치는 마켓에 이미 신청되어 있습니다. (${other.title})`);
    }
  }

  return { ok: true, market };
}

/**
 * [3.11.6.2] 본인이 주최한 마켓의 결제 건인지 확인합니다.
 * 자기신청이 막히면 원래는 생길 수 없는 데이터지만,
 * 차단 이전에 쌓인 건이 남아 있을 수 있어 환불 요청 경로에서도 한 번 더 막습니다.
 */
export function isOwnMarketPayment(hostId, userId) {
  return Number(hostId) === Number(userId);
}

export default {
  ACTIVE_APPLICATION_STATUSES,
  checkBoothApplyEligibility,
  isOwnMarketPayment,
};
