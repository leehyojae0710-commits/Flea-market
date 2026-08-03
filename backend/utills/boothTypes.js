// backend/utills/boothTypes.js
// [부스 종류(카테고리) - 신규 파일]
//
// 담는 것: 주최자가 마켓마다 최대 3개까지 만드는 "부스 종류"의 저장·조회·가격 계산.
//
//   예) 스탠다드 30,000원 / 프리미엄 50,000원 / 푸드존 80,000원
//
// 왜 필요했나
//   기존에는 마켓 하나에 부스료가 딱 하나(markets.boothPrice)뿐이었습니다.
//   실제 플리마켓은 자리 위치·크기·전기 사용 여부에 따라 가격이 다른 게 보통이라,
//   주최자가 종류를 나눠 올리고 판매자가 골라 신청할 수 있어야 합니다.
//
// 설계 요점
//   1) 별도 테이블(market_booth_types)로 둡니다. markets 에 컬럼 6개를 늘리면
//      "3개"라는 상한이 스키마에 굳어져서 나중에 못 늘립니다.
//   2) 신청(applications)에는 boothTypeId 만 저장하고 가격은 저장하지 않습니다.
//      가격은 항상 "지금 종류의 가격"을 읽습니다 → 주최자가 금액을 바꾸면
//      메인 화면의 「기존 금액 → 변경 금액」 표시와 결제 금액이 자동으로 같이 움직입니다.
//   3) 종류를 지울 때, 이미 그 종류로 신청한 사람이 있으면 삭제하지 않고
//      isActive=0 으로 내립니다. 신청자의 금액이 갑자기 바뀌는 사고를 막습니다.
//      (isActive=0 인 종류는 새 신청 화면에는 안 뜨고, 기존 신청의 가격 계산에는 계속 쓰입니다.)
//   4) 마이그레이션을 아직 안 돌린 DB에서도 절대 500 이 나지 않아야 합니다.
//      테이블/컬럼 유무를 확인해서 없으면 기존 동작(markets.boothPrice 단일가)으로 돌아갑니다.

/** 한 마켓이 가질 수 있는 부스 종류 최대 개수 */
export const MAX_BOOTH_TYPES = 3;

/**
 * 부스 종류 이름은 주최자가 직접 입력하지 않고 순서대로 자동으로 매깁니다.
 *   첫 번째 = A, 「부스 추가」를 누르면 B, 한 번 더 누르면 C (여기까지가 상한)
 * 이름을 자유 입력으로 두면 마켓마다 표기가 제각각이 되고, 판매자가 고를 때
 * 무엇이 상위 등급인지 알기 어려워집니다. A/B/C 로 고정하면 화면 어디서든 같게 보입니다.
 */
export const BOOTH_TYPE_LABELS = ['A', 'B', 'C'];

/** 순서(0부터)에 해당하는 부스 이름을 돌려줍니다. 범위를 벗어나면 null. */
export function boothTypeLabel(index) {
  return BOOTH_TYPE_LABELS[index] ?? null;
}

/** 부스 종류 이름 길이 상한 (자동 부여라 사실상 1글자지만 컬럼 상한과 맞춰 둡니다) */
export const BOOTH_TYPE_NAME_MAX = 30;

/** 부스를 점유하고 있다고 보는 신청 상태 (applicationPolicy 와 동일) */
const ACTIVE_STATUSES = ['Pending', 'Approved', 'Paid'];

/* ------------------------------------------------------------------ */
/* 스키마 준비 상태 확인                                                */
/* ------------------------------------------------------------------ */

const PRESENT_TTL_MS = 10 * 60 * 1000;
const MISSING_TTL_MS = 60 * 1000; // 마이그레이션 후 서버 재시작 없이 인식되도록

let readyCache = null;
let readyCacheExpires = 0;

export function resetBoothTypeCache() {
  readyCache = null;
  readyCacheExpires = 0;
}

/**
 * @returns {Promise<{ table:boolean, column:boolean, ready:boolean }>}
 *   table  : market_booth_types 테이블이 있는가
 *   column : applications.boothTypeId 컬럼이 있는가
 *   ready  : 둘 다 있는가 (부스 종류 기능을 켤 수 있는가)
 */
export async function getBoothTypeReadiness(db) {
  const now = Date.now();
  if (readyCache && now < readyCacheExpires) return readyCache;

  let state = { table: false, column: false, lockColumn: false, capacityColumn: false, ready: false };
  try {
    const [[t]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'market_booth_types'`
    );
    const [cols] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'applications'
          AND column_name IN ('boothTypeId', 'approvedPrice')`
    );
    // [종류별 정원] market_booth_types.capacity 유무. 없으면 종류별 제한만 꺼집니다.
    const [capCols] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'market_booth_types'
          AND column_name = 'capacity'`
    );
    // [대소문자] information_schema 는 정의된 표기 그대로 돌려줍니다.
    //   소문자로 정규화해서 비교하지 않으면, 컬럼이 있는데도 "없음"으로 판정되어
    //   해당 기능이 조용히 꺼집니다. (정원 검사가 무력화됐던 것과 같은 원인)
    const names = new Set(cols.map((r) => String(r.c).toLowerCase()));
    state = {
      table: t.cnt > 0,
      column: names.has('boothtypeid'),
      // [승인 시 금액 고정] 승인 시점 금액을 박아두는 컬럼. 없으면 예전처럼 현재가를 씁니다.
      lockColumn: names.has('approvedprice'),
      capacityColumn: capCols.length > 0,
      ready: t.cnt > 0 && names.has('boothtypeid'),
    };
  } catch (error) {
    console.warn('[boothTypes] 스키마 확인 실패, 기능을 끕니다:', error.message);
  }

  readyCache = state;
  readyCacheExpires = now + (state.ready && state.lockColumn ? PRESENT_TTL_MS : MISSING_TTL_MS);
  return readyCache;
}

/* ------------------------------------------------------------------ */
/* 입력값 정규화                                                        */
/* ------------------------------------------------------------------ */

/**
 * 화면에서 올라온 부스 종류 배열을 검사·정리합니다.
 * 입력 예: [{ boothTypeId: 3, name: '프리미엄', price: 50000 }, { name: '스탠다드', price: 30000 }]
 *
 * @returns {{ ok:true, list:Array } | { ok:false, message:string }}
 *   list 항목: { boothTypeId:number|null, name:string, price:number, sortOrder:number }
 *   빈 배열이면 "종류 없음"(= 기존처럼 단일가 마켓)을 뜻합니다.
 */
export function normalizeBoothTypes(input) {
  if (input === undefined || input === null) return { ok: true, list: null }; // 미전송 = 건드리지 않음
  if (!Array.isArray(input)) return { ok: false, message: '부스 종류 형식이 올바르지 않습니다.' };

  if (input.length > MAX_BOOTH_TYPES) {
    return { ok: false, message: `부스 종류는 최대 ${MAX_BOOTH_TYPES}개(A/B/C)까지 등록할 수 있습니다.` };
  }

  const list = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;

    // 가격을 안 채운 줄은 "부스 추가만 눌러 놓고 안 쓴 칸"으로 보고 조용히 버립니다.
    const rawPrice = raw.price;
    if (rawPrice === undefined || rawPrice === null || String(rawPrice).trim() === '') continue;

    const priceNum = Number(rawPrice);
    const label = boothTypeLabel(list.length);

    if (!Number.isFinite(priceNum) || !Number.isInteger(priceNum) || priceNum < 0) {
      return { ok: false, message: `${label} 부스의 가격은 0 이상의 정수여야 합니다.` };
    }
    if (priceNum > 100000000) {
      return { ok: false, message: `${label} 부스의 가격이 너무 큽니다.` };
    }

    // [종류별 정원] 이 종류로 받을 최대 부스 수. 안 적으면 0(제한 없음).
    //   총 정원(markets.maxParticipants)과 별개로 종류마다 따로 셉니다.
    const rawCap = raw.capacity;
    let capacity = 0;
    if (rawCap !== undefined && rawCap !== null && String(rawCap).trim() !== '') {
      const capNum = Number(rawCap);
      if (!Number.isInteger(capNum) || capNum < 0) {
        return { ok: false, message: `${label} 부스의 수량은 0 이상의 정수여야 합니다.` };
      }
      if (capNum > 100000) {
        return { ok: false, message: `${label} 부스의 수량이 너무 큽니다.` };
      }
      capacity = capNum;
    }

    const idNum = Number(raw.boothTypeId);
    list.push({
      capacity,
      boothTypeId: Number.isInteger(idNum) && idNum > 0 ? idNum : null,
      // 이름은 클라이언트가 뭘 보내든 순서대로 다시 매깁니다. (A → B → C)
      name: label,
      price: priceNum,
      sortOrder: list.length,
      // [신규 신청 중단] 삭제 대신 쓰는 스위치. 값이 없으면 기존처럼 모집 중(1).
      isActive: raw.isActive === false || raw.isActive === 0 || raw.isActive === '0' ? 0 : 1,
    });
  }

  return { ok: true, list };
}

/* ------------------------------------------------------------------ */
/* 신청 건수 세기                                                       */
/* ------------------------------------------------------------------ */

/**
 * 이 마켓의 부스 종류별 "살아 있는 신청" 건수를 셉니다.
 *   삭제 가능 여부(0건이어야 삭제)와 화면 안내에 씁니다.
 * @returns {Promise<Map<number, number>>} boothTypeId → 건수
 */
export async function countApplicationsByType(db, marketId) {
  const { column } = await getBoothTypeReadiness(db);
  if (!column) return new Map();

  const [rows] = await db.query(
    `SELECT boothTypeId, COUNT(*) AS cnt
       FROM applications
      WHERE marketId = ? AND boothTypeId IS NOT NULL
        AND status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})
      GROUP BY boothTypeId`,
    [marketId, ...ACTIVE_STATUSES]
  );

  return new Map(rows.map((r) => [Number(r.boothTypeId), Number(r.cnt)]));
}

/* ------------------------------------------------------------------ */
/* 저장                                                                */
/* ------------------------------------------------------------------ */

/**
 * 마켓의 부스 종류를 화면에서 보낸 목록과 똑같이 맞춥니다.
 *   - boothTypeId 가 있는 항목 → UPDATE (이름/가격/순서)
 *   - boothTypeId 가 없는 항목 → INSERT
 *   - DB 에는 있는데 목록에 없는 항목 → 신청 이력이 있으면 isActive=0, 없으면 DELETE
 *
 * @param {*} db pool 또는 트랜잭션 커넥션
 * @returns {Promise<{ saved:number, deactivated:string[], removed:number, skipped:boolean }>}
 */
export async function saveBoothTypes(db, marketId, list) {
  if (list === null || list === undefined) {
    return { ok: true, saved: 0, stopped: [], removed: 0, skipped: false };
  }

  const { table, capacityColumn } = await getBoothTypeReadiness(db);
  if (!table) return { ok: true, saved: 0, stopped: [], removed: 0, skipped: true };
  const schemaHasCapacity = capacityColumn;

  const [existing] = await db.query(
    `SELECT boothTypeId, name FROM market_booth_types WHERE marketId = ?`,
    [marketId]
  );
  // 종류별 신청 건수 — 삭제 가능 여부와 이름 고정 여부를 여기서 판단합니다.
  //   이미 신청이 들어온 종류는 이름을 바꾸지 않습니다.
  //   A/B/C 는 순서대로 매겨지므로, 앞의 것을 지우면 뒤 종류의 이름이 밀려서 바뀝니다.
  //   그러면 "B 부스에 신청했는데 어느새 A가 되어 있는" 상황이 생기기 때문입니다.
  const counts = await countApplicationsByType(db, marketId);
  const nameById = new Map(existing.map((r) => [Number(r.boothTypeId), r.name]));

  // [삭제 차단] 신청자가 있는 종류를 목록에서 빼면 저장 자체를 거부합니다.
  //   예전에는 조용히 숨김 처리했는데, 주최자는 "지웠다"고 생각하고 판매자는 여전히
  //   그 부스에 붙어 있어서 서로 다른 화면을 보게 됐습니다.
  //   신청자가 있는 종류를 정말 지우려면 환불부터 정리해야 하므로, 여기서 막고 알려줍니다.
  const requestedIds = new Set(list.map((i) => i.boothTypeId).filter(Boolean));
  const blocked = [];
  for (const row of existing) {
    const id = Number(row.boothTypeId);
    if (requestedIds.has(id)) continue;
    const cnt = counts.get(id) || 0;
    if (cnt > 0) blocked.push({ name: row.name, count: cnt });
  }
  if (blocked.length > 0) {
    const detail = blocked.map((b) => `${b.name}(${b.count}건)`).join(', ');
    return {
      ok: false,
      status: 409,
      code: 'BOOTH_TYPE_IN_USE',
      message: `부스 ${detail}에 이미 신청이 있어 삭제할 수 없습니다. `
        + '삭제하면 신청자에게 환불이 필요해집니다. '
        + '더 받지 않으시려면 「신규 신청 중단」을 켜주세요. 기존 신청자는 그대로 유지됩니다.',
    };
  }
  const existingIds = new Set(existing.map((r) => Number(r.boothTypeId)));

  const keepIds = new Set();
  let saved = 0;

  for (const item of list) {
    if (item.boothTypeId && existingIds.has(item.boothTypeId)) {
      const hasApplicants = (counts.get(item.boothTypeId) || 0) > 0;
      const keepName = hasApplicants ? (nameById.get(item.boothTypeId) || item.name) : item.name;
      // capacity 컬럼이 없는 DB 에서는 그 항목만 빼고 저장합니다. (마이그레이션 미실행 대비)
      const capSet = schemaHasCapacity ? ', capacity = ?' : '';
      const capVal = schemaHasCapacity ? [item.capacity ?? 0] : [];
      await db.query(
        `UPDATE market_booth_types
            SET name = ?, price = ?, sortOrder = ?, isActive = ?${capSet}
          WHERE boothTypeId = ? AND marketId = ?`,
        [keepName, item.price, item.sortOrder, item.isActive ?? 1, ...capVal, item.boothTypeId, marketId]
      );
      keepIds.add(item.boothTypeId);
    } else {
      const capCol = schemaHasCapacity ? ', capacity' : '';
      const capPh = schemaHasCapacity ? ', ?' : '';
      const capVal = schemaHasCapacity ? [item.capacity ?? 0] : [];
      const [result] = await db.query(
        `INSERT INTO market_booth_types (marketId, name, price, sortOrder, isActive${capCol})
         VALUES (?, ?, ?, ?, ?${capPh})`,
        [marketId, item.name, item.price, item.sortOrder, item.isActive ?? 1, ...capVal]
      );
      keepIds.add(Number(result.insertId));
    }
    saved += 1;
  }

  // 목록에서 빠진 종류 정리 — 위에서 막았으므로 여기 오는 건 전부 신청 0건입니다.
  const keepArr = [...keepIds];
  let removed = 0;
  for (const row of existing) {
    const id = Number(row.boothTypeId);
    if (keepArr.includes(id)) continue;
    await db.query(`DELETE FROM market_booth_types WHERE boothTypeId = ?`, [id]);
    removed += 1;
  }

  // 「신규 신청 중단」으로 내려둔 종류 (안내 문구용)
  const stopped = list
    .filter((i) => (i.isActive ?? 1) === 0)
    .map((i, idx) => i.name || boothTypeLabel(idx));

  return { ok: true, saved, stopped, removed, skipped: false };
}

/* ------------------------------------------------------------------ */
/* 조회                                                                */
/* ------------------------------------------------------------------ */

/**
 * 여러 마켓의 부스 종류를 한 번에 가져와 각 행에 boothTypes 배열로 붙입니다.
 * (마켓 목록 화면에서 마켓마다 쿼리를 날리지 않기 위해 IN 으로 한 방에 조회합니다.)
 *
 * @param rows 마켓 행 배열 (marketId 를 가진 객체)
 * @param includeInactive true 면 숨김 처리된 종류도 포함 (주최자 수정 화면용은 false 권장)
 */
export async function attachBoothTypes(db, rows, { includeInactive = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const { table } = await getBoothTypeReadiness(db);
  if (!table) {
    for (const r of rows) r.boothTypes = [];
    return rows;
  }

  const ids = [...new Set(rows.map((r) => Number(r.marketId)).filter(Boolean))];
  if (ids.length === 0) {
    for (const r of rows) r.boothTypes = [];
    return rows;
  }

  const activeSql = includeInactive ? '' : ' AND isActive = 1';
  const { capacityColumn } = await getBoothTypeReadiness(db);
  const capSelect = capacityColumn ? ', capacity' : ', 0 AS capacity';
  const [types] = await db.query(
    `SELECT boothTypeId, marketId, name, price, sortOrder, isActive${capSelect}
       FROM market_booth_types
      WHERE marketId IN (${ids.map(() => '?').join(', ')})${activeSql}
      ORDER BY marketId, sortOrder, boothTypeId`,
    ids
  );

  // [삭제 차단] 주최자 수정 화면이 "이 종류는 신청이 N건이라 못 지운다"를 눌러보기 전에
  //   알 수 있어야 합니다. 종류별 신청 건수를 한 번에 세서 같이 내려보냅니다.
  const counts = new Map();
  const { column } = await getBoothTypeReadiness(db);
  if (column && types.length > 0) {
    const typeIds = types.map((t) => Number(t.boothTypeId));
    const [cntRows] = await db.query(
      `SELECT boothTypeId, COUNT(*) AS cnt
         FROM applications
        WHERE boothTypeId IN (${typeIds.map(() => '?').join(', ')})
          AND status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})
        GROUP BY boothTypeId`,
      [...typeIds, ...ACTIVE_STATUSES]
    );
    for (const r of cntRows) counts.set(Number(r.boothTypeId), Number(r.cnt));
  }

  const byMarket = new Map();
  for (const t of types) {
    const key = Number(t.marketId);
    if (!byMarket.has(key)) byMarket.set(key, []);
    byMarket.get(key).push({
      boothTypeId: Number(t.boothTypeId),
      name: t.name,
      price: Number(t.price),
      sortOrder: Number(t.sortOrder),
      isActive: Number(t.isActive) === 1,
      // [종류별 정원] 0 이면 이 종류는 제한 없음.
      capacity: Number(t.capacity) || 0,
      // 신청 건수. 0 이어야 삭제할 수 있고, 화면 게이지의 분자로도 씁니다.
      applicationCount: counts.get(Number(t.boothTypeId)) || 0,
    });
  }

  for (const r of rows) r.boothTypes = byMarket.get(Number(r.marketId)) || [];
  return rows;
}

/** 마켓 하나의 부스 종류만 조회 */
export async function getBoothTypes(db, marketId, { includeInactive = false } = {}) {
  const rows = [{ marketId: Number(marketId) }];
  await attachBoothTypes(db, rows, { includeInactive });
  return rows[0].boothTypes;
}

/* ------------------------------------------------------------------ */
/* 신청 시 검증                                                         */
/* ------------------------------------------------------------------ */

/**
 * 판매자가 고른 부스 종류가 이 마켓의 것이 맞는지, 아직 선택 가능한지 확인합니다.
 *
 * @returns {Promise<{ ok:true, boothType:object|null } | { ok:false, status:number, code:string, message:string }>}
 *   boothType 이 null 이면 "종류를 안 쓰는 마켓"이라 markets.boothPrice 를 그대로 씁니다.
 */
export async function resolveBoothTypeForApply(db, {
  marketId, boothTypeId, excludeApplicationId = null, allowOvercapacity = false,
}) {
  const { ready } = await getBoothTypeReadiness(db);
  if (!ready) return { ok: true, boothType: null };

  const available = await getBoothTypes(db, marketId, { includeInactive: false });

  // 이 마켓이 종류를 안 쓰면 선택값은 무시합니다.
  if (available.length === 0) return { ok: true, boothType: null };

  const picked = Number(boothTypeId);
  if (!Number.isInteger(picked) || picked <= 0) {
    return {
      ok: false,
      status: 400,
      code: 'BOOTH_TYPE_REQUIRED',
      message: '부스 종류를 선택해 주세요.',
    };
  }

  const found = available.find((t) => t.boothTypeId === picked);
  if (!found) {
    return {
      ok: false,
      status: 409,
      code: 'BOOTH_TYPE_NOT_FOUND',
      message: '선택한 부스 종류를 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 선택해 주세요.',
    };
  }

  // [종류별 정원] 이 종류로 받기로 한 칸 수를 넘겼는지 확인합니다.
  //   총 정원(markets.maxParticipants)과 별개입니다. 총 정원에 여유가 있어도
  //   A가 다 찼으면 A로는 더 못 받습니다. (자리 크기·위치가 정해져 있으므로)
  //   신청 수정 경로에서는 자기 자신의 건을 빼고 셉니다.
  //   주최자가 「초과 신청 허용」을 켜두면 총 정원과 마찬가지로 종류별 정원도 풀립니다.
  //   두 정원이 다르게 동작하면 주최자가 옵션을 켜고도 왜 막히는지 알 수 없습니다.
  const capacity = Number(found.capacity) || 0;
  if (capacity > 0 && !allowOvercapacity) {
    const excludeSql = excludeApplicationId ? ' AND applicationId <> ?' : '';
    const excludeParam = excludeApplicationId ? [excludeApplicationId] : [];
    const [[occupied]] = await db.query(
      `SELECT COUNT(*) AS cnt FROM applications
        WHERE boothTypeId = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(', ')})${excludeSql}`,
      [found.boothTypeId, ...ACTIVE_STATUSES, ...excludeParam]
    );
    if (Number(occupied.cnt) >= capacity) {
      return {
        ok: false,
        status: 409,
        code: 'BOOTH_TYPE_FULL',
        message: `부스 ${found.name}는 신청이 마감되었습니다. (${occupied.cnt}/${capacity}) 다른 종류를 선택해 주세요.`,
      };
    }
  }

  return { ok: true, boothType: found };
}

/* ------------------------------------------------------------------ */
/* 가격 계산 — 조회 SQL 조각                                            */
/* ------------------------------------------------------------------ */

/**
 * "실제 결제 금액" 을 구하는 SQL 조각을 만듭니다.
 * 부스 종류를 고른 신청은 그 종류의 가격, 아니면 마켓의 기본 부스료를 씁니다.
 *
 * 이 조각을 getMyApplications / 결제 / 신청자 목록이 공유해야
 * "화면에 보이는 금액"과 "실제로 결제되는 금액"이 어긋나지 않습니다.
 *
 * @returns {Promise<{ join:string, priceExpr:string, nameExpr:string, idExpr:string, ready:boolean }>}
 */
export async function boothTypePriceSql(db, { app = 'a', market = 'm', type = 'bt' } = {}) {
  const { ready, lockColumn } = await getBoothTypeReadiness(db);

  // [승인 시 금액 고정] 승인된 신청은 approvedPrice 가 최우선입니다.
  //   주최자가 승인 뒤에 부스 가격을 올려도, 이미 승인된 판매자가 낼 금액은 안 바뀝니다.
  //   승인 전(Pending)에는 값이 NULL 이라 자연스럽게 현재가를 따라갑니다.
  const lock = lockColumn ? `${app}.approvedPrice, ` : '';

  if (!ready) {
    return {
      ready: false,
      lockReady: lockColumn,
      join: '',
      priceExpr: lockColumn ? `COALESCE(${app}.approvedPrice, ${market}.boothPrice)` : `${market}.boothPrice`,
      nameExpr: 'NULL',
      idExpr: 'NULL',
    };
  }

  return {
    ready: true,
    lockReady: lockColumn,
    join: `LEFT JOIN market_booth_types ${type} ON ${type}.boothTypeId = ${app}.boothTypeId`,
    priceExpr: `COALESCE(${lock}${type}.price, ${market}.boothPrice)`,
    nameExpr: `${type}.name`,
    idExpr: `${app}.boothTypeId`,
  };
}

/* ------------------------------------------------------------------ */
/* 승인 시 금액 고정                                                    */
/* ------------------------------------------------------------------ */

/**
 * 승인 시점의 부스 금액을 신청에 박아둡니다.
 *
 * 왜 승인 시점인가
 *   신청은 "이 가격이면 하겠다"는 의사표시일 뿐이고, 주최자가 승인해야 자리가 확정됩니다.
 *   확정된 뒤에 금액이 바뀌면 판매자는 동의한 적 없는 금액을 내게 됩니다.
 *   그래서 승인되는 순간의 금액을 그대로 고정하고, 이후 주최자가 가격을 바꿔도
 *   이미 승인된 건에는 영향이 없게 합니다. (기획서 「금액 인상 시 소급 미적용」)
 *
 * 승인 전(Pending)에는 고정하지 않습니다. 아직 확정 전이라 현재가를 따라가는 게 맞습니다.
 *
 * @returns {Promise<{ locked:boolean, price:number|null }>}
 */
export async function lockApprovedPrice(db, applicationId) {
  const { lockColumn } = await getBoothTypeReadiness(db);
  if (!lockColumn) return { locked: false, price: null };

  const frag = await boothTypePriceSql(db, { app: 'a', market: 'm', type: 'bt' });

  // 고정할 금액을 계산할 때는 approvedPrice 를 빼고 봅니다.
  //   (이미 값이 있으면 자기 자신을 다시 넣게 되고, 재승인 시 옛 금액이 굳어버립니다.)
  const priceExpr = frag.ready
    ? 'COALESCE(bt.price, m.boothPrice)'
    : 'm.boothPrice';

  const [rows] = await db.query(
    `SELECT ${priceExpr} AS price
       FROM applications a
       JOIN markets m ON m.marketId = a.marketId
       ${frag.join}
      WHERE a.applicationId = ?`,
    [applicationId]
  );
  if (rows.length === 0) return { locked: false, price: null };

  const price = Number(rows[0].price) || 0;
  await db.query('UPDATE applications SET approvedPrice = ? WHERE applicationId = ?', [price, applicationId]);
  return { locked: true, price };
}

/** 화면 표시용 요약 문구 (주최자에게 저장 결과를 알려줄 때) */
export function describeBoothTypeSave(result) {
  if (!result || result.skipped) {
    return '부스 종류는 DB에 아직 테이블이 없어 저장되지 않았어요. '
      + '백엔드에서 "node scripts/migrate-add-booth-types.js" 를 한 번 실행해주세요.';
  }
  if (result.stopped && result.stopped.length > 0) {
    return `부스 ${result.stopped.join(', ')}는 신규 신청을 받지 않도록 바꿨어요. `
      + '이미 신청한 판매자는 그대로 유지됩니다.';
  }
  return '';
}

export default {
  MAX_BOOTH_TYPES,
  BOOTH_TYPE_NAME_MAX,
  getBoothTypeReadiness,
  resetBoothTypeCache,
  normalizeBoothTypes,
  saveBoothTypes,
  attachBoothTypes,
  getBoothTypes,
  countApplicationsByType,
  lockApprovedPrice,
  resolveBoothTypeForApply,
  boothTypePriceSql,
  describeBoothTypeSave,
};
