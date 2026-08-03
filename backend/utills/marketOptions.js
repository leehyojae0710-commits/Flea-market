// backend/utills/marketOptions.js
// [주최자 마켓 옵션 - 신규 파일]
//
// 담는 것: 마켓 등록/수정 화면에서 주최자가 켜고 끄는 "부스 신청 옵션" 두 개를
//          한 곳에서 해석하고, DB 컬럼 유무까지 흡수합니다.
//
//   allowOvercapacity          (기본 0) 정원이 차도 행사 시작 전까지 초과 신청/승인/결제 허용
//   allowDuplicateApplication  (기본 1) 같은 판매자가 이 마켓에 부스를 여러 개 신청 허용
//
// 왜 만들었나
//   1) 등록(createMarket)과 수정(updateMarketStatus)이 서로 다른 필드만 처리하고 있었습니다.
//      - 등록: allowDuplicateApplication 만 INSERT, allowOvercapacity 는 아예 누락
//        → 새로 만든 마켓은 무조건 초과 신청 불가로 굳어지고, 수정 화면에 들어가야만 켤 수 있었음
//      - 수정: 둘 다 처리
//   2) INSERT/UPDATE 문에 컬럼명을 하드코딩해 두면, 마이그레이션을 아직 안 돌린 DB에서
//      "Unknown column 'allowDuplicateApplication'" 로 마켓 등록 자체가 500 으로 죽습니다.
//      팀원마다 DB 반영 시점이 다르므로, 없는 컬럼은 조용히 건너뛰고 나머지는 저장되게 합니다.
//      (실제로 값이 저장되지 않았다는 사실은 skipped 로 돌려줘서 화면에서 안내합니다.)
//
// 판정(신청을 실제로 막고 통과시키는 쪽)은 utills/applicationPolicy.js 에 있습니다.
// 이 파일은 "주최자가 설정한 값을 읽고 쓰는" 책임만 집니다.

/** 옵션 정의 — 컬럼명과 기본값을 여기 한 곳에서만 관리합니다. */
export const MARKET_OPTIONS = [
  {
    key: 'allowOvercapacity',
    column: 'allowOvercapacity',
    defaultValue: 0,
    label: '정원 초과 신청 허용',
    migration: 'node scripts/migrate-add-market-options.js',
  },
  {
    key: 'allowDuplicateApplication',
    column: 'allowDuplicateApplication',
    defaultValue: 1,
    label: '판매자 중복 부스 신청 허용',
    migration: 'node scripts/migrate-add-market-options.js',
  },
];

export const MARKET_OPTION_KEYS = MARKET_OPTIONS.map((o) => o.key);

/* ------------------------------------------------------------------ */
/* 값 해석                                                             */
/* ------------------------------------------------------------------ */

/**
 * 체크박스 값을 0/1 로 정규화합니다.
 * true / 1 / '1' / 'true' / 'on' / 'Y'  → 1
 * false / 0 / '0' / 'false' / 'off' / '' → 0
 * undefined / null → null (= 클라이언트가 보내지 않음)
 */
export function toFlag(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  const s = String(value).trim().toLowerCase();
  if (s === '') return null;
  if (['0', 'false', 'off', 'no', 'n'].includes(s)) return 0;
  if (['1', 'true', 'on', 'yes', 'y'].includes(s)) return 1;
  return null;
}

/**
 * req.body 에서 옵션 값을 뽑습니다.
 * @param {object} body
 * @param {boolean} useDefaults true(등록)면 안 보낸 값에 기본값을 채우고,
 *                              false(수정)면 안 보낸 값은 건드리지 않습니다.
 * @returns {{ [key:string]: number }} 실제로 반영할 값만 담긴 객체
 */
export function resolveMarketOptions(body = {}, { useDefaults = false } = {}) {
  const out = {};
  for (const opt of MARKET_OPTIONS) {
    const flag = toFlag(body[opt.key]);
    if (flag !== null) out[opt.key] = flag;
    else if (useDefaults) out[opt.key] = opt.defaultValue;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 스키마 차이 흡수                                                     */
/* ------------------------------------------------------------------ */

// 컬럼이 "있다"는 결과는 오래 캐시해도 되지만, "없다"는 결과를 영구 캐시하면
// 마이그레이션을 돌린 뒤에도 서버를 재시작하기 전까지 계속 무시됩니다.
// 그래서 activeRole 때와 같은 방식으로, 없을 때만 짧은 TTL 을 둡니다.
const PRESENT_TTL_MS = 10 * 60 * 1000; // 다 있음 → 10분
const MISSING_TTL_MS = 60 * 1000;      // 하나라도 없음 → 60초

let columnCache = null;      // Set<string>
let columnCacheExpires = 0;  // epoch ms

/** 테스트/마이그레이션 직후 강제 갱신용 */
export function resetMarketOptionColumnCache() {
  columnCache = null;
  columnCacheExpires = 0;
}

/**
 * markets 테이블에 실제로 존재하는 옵션 컬럼 목록을 돌려줍니다.
 * information_schema 조회 자체가 실패하면(권한 등) 빈 Set 대신 "전부 있다"고 보고
 * 기존 동작을 유지합니다 — 정상 DB에서 옵션이 조용히 무시되는 쪽이 더 나쁘기 때문입니다.
 */
export async function getAvailableOptionColumns(db) {
  const now = Date.now();
  if (columnCache && now < columnCacheExpires) return columnCache;

  let found;
  try {
    const [rows] = await db.query(
      `SELECT COLUMN_NAME AS c FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'markets'`
    );
    // [대소문자] 정의된 표기와 코드의 표기가 달라도 같은 컬럼으로 인식되게 정규화합니다.
    const all = new Set(rows.map((r) => String(r.c).toLowerCase()));
    found = new Set(MARKET_OPTIONS.filter((o) => all.has(o.column.toLowerCase())).map((o) => o.key));
  } catch (error) {
    console.warn('[marketOptions] 컬럼 조회 실패, 전부 있다고 가정합니다:', error.message);
    found = new Set(MARKET_OPTION_KEYS);
  }

  columnCache = found;
  columnCacheExpires = now + (found.size === MARKET_OPTIONS.length ? PRESENT_TTL_MS : MISSING_TTL_MS);
  return columnCache;
}

/* ------------------------------------------------------------------ */
/* SQL 조각 만들기                                                      */
/* ------------------------------------------------------------------ */

/**
 * INSERT 용 조각. (마켓 등록)
 * @returns {{ columns:string[], values:number[], applied:object, skipped:string[] }}
 */
export async function buildInsertOptions(db, body) {
  const wanted = resolveMarketOptions(body, { useDefaults: true });
  const available = await getAvailableOptionColumns(db);

  const columns = [];
  const values = [];
  const applied = {};
  const skipped = [];

  for (const opt of MARKET_OPTIONS) {
    if (!available.has(opt.key)) {
      // 사용자가 명시적으로 켰는데 컬럼이 없을 때만 "무시됐다"고 알립니다.
      if (toFlag(body?.[opt.key]) !== null) skipped.push(opt.key);
      continue;
    }
    columns.push(opt.column);
    values.push(wanted[opt.key]);
    applied[opt.key] = wanted[opt.key];
  }

  return { columns, values, applied, skipped };
}

/**
 * UPDATE 용 조각. (마켓 수정)
 * 클라이언트가 보낸 옵션만 반영합니다. 안 보낸 옵션은 기존 값을 유지합니다.
 * @returns {{ fields:string[], values:number[], applied:object, skipped:string[] }}
 */
export async function buildUpdateOptions(db, body) {
  const wanted = resolveMarketOptions(body, { useDefaults: false });
  const available = await getAvailableOptionColumns(db);

  const fields = [];
  const values = [];
  const applied = {};
  const skipped = [];

  for (const opt of MARKET_OPTIONS) {
    if (!(opt.key in wanted)) continue;
    if (!available.has(opt.key)) { skipped.push(opt.key); continue; }
    fields.push(`${opt.column} = ?`);
    values.push(wanted[opt.key]);
    applied[opt.key] = wanted[opt.key];
  }

  return { fields, values, applied, skipped };
}

/**
 * 저장하지 못한 옵션을 사람이 읽는 문장으로 바꿉니다. (없으면 빈 문자열)
 */
export function describeSkippedOptions(skipped = []) {
  if (!skipped || skipped.length === 0) return '';
  const labels = skipped
    .map((k) => MARKET_OPTIONS.find((o) => o.key === k)?.label || k)
    .join(', ');
  return `단, [${labels}] 설정은 DB에 아직 컬럼이 없어 저장되지 않았어요. `
    + `백엔드에서 "node scripts/migrate-add-market-options.js" 를 한 번 실행해주세요.`;
}

export default {
  MARKET_OPTIONS,
  MARKET_OPTION_KEYS,
  toFlag,
  resolveMarketOptions,
  getAvailableOptionColumns,
  resetMarketOptionColumnCache,
  buildInsertOptions,
  buildUpdateOptions,
  describeSkippedOptions,
};
