// backend/scripts/seed-applications.js
// [추가] applications(부스 신청) 테이블에 랜덤 더미 데이터를 생성해서 넣습니다.
// seed-markets.js 와 같은 방식(배치 INSERT, 개수 argv로 조절)으로 작성했습니다.
// sellerId는 users 테이블에서 실제 존재하는 "판매자(userType=0)" 유저 중 무작위로,
// marketId는 실제 존재하는 markets 중 무작위로 골라서 사용합니다.
// (판매자 유저나 마켓이 하나도 없으면 안전하게 중단합니다.)
//
// 실행: cd backend && node scripts/seed-applications.js
//   개수 바꾸고 싶으면: node scripts/seed-applications.js 500
//   특정 판매자 1명한테만 몰아서 넣고 싶으면: node scripts/seed-applications.js 500 --seller=2

import pool from '../config/db.js';

const args = process.argv.slice(2);
const positional = args.find((a) => !a.startsWith('--'));
const TOTAL_COUNT = Number(positional) || 2000;
const BATCH_SIZE = 500; // 한 번에 넣을 row 수

function getArg(name, fallback) {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
}
const ONLY_SELLER_ID = getArg('seller', null);

// ---------- 랜덤 유틸 ----------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function maybe(value, probabilityTrue) {
  return Math.random() < probabilityTrue ? value : null;
}
function pickWeighted(weightMap) {
  const entries = Object.entries(weightMap);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}
function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------- 데이터 풀 ----------
const ITEMS = [
  '핸드메이드 액세서리', '빈티지 의류', '원두커피', '다육식물', '수제 비누',
  '그림엽서', '캔들', '도자기 소품', '반려동물 간식', '에코백',
  '수제 잼', '드립백 세트', '레진 공예품', '자수 소품', '중고 LP',
  '수제 쿠키', '홈카페 원두', '미니어처', '가죽 소품', '북스탠드',
];
const BOOTH_TITLE_SUFFIX = ['공방', '스튜디오', '마켓', '셀렉트', '하우스', ''];

function randomItemName() {
  return pick(ITEMS);
}
function randomBoothTitle(itemName) {
  return `${itemName} ${pick(BOOTH_TITLE_SUFFIX)}`.trim();
}
function randomProductDesc(itemName) {
  return `${itemName} 판매 부스입니다. 테스트용 더미 신청 데이터입니다.`;
}

async function getSellerIds() {
  if (ONLY_SELLER_ID) {
    const [rows] = await pool.query(
      `SELECT userId FROM users WHERE userId = ? AND userType = 0`,
      [ONLY_SELLER_ID]
    );
    return rows.map((r) => r.userId);
  }
  const [rows] = await pool.query(`SELECT userId FROM users WHERE userType = 0`);
  return rows.map((r) => r.userId);
}

async function getMarkets() {
  const [rows] = await pool.query(
    `SELECT marketId, maxParticipants, isExpired, eventDate_max FROM markets`
  );
  return rows;
}

// 마켓 상태(종료 여부)에 따라 신청 상태 분포를 다르게 줌
// (이미 끝난 마켓인데 Pending/Expired만 잔뜩 있는 건 부자연스러워서)
function pickStatus(market, today) {
  const isEnded = market.isExpired || (market.eventDate_max && new Date(market.eventDate_max) < today);
  if (isEnded) {
    return pickWeighted({ Paid: 45, Approved: 15, Rejected: 20, Expired: 15, Pending: 5 });
  }
  return pickWeighted({ Pending: 40, Approved: 25, Rejected: 15, Paid: 15, Expired: 5 });
}

function buildRow(sellerIds, markets, usedBoothKeys, today) {
  const market = pick(markets);
  const capacity = market.maxParticipants && market.maxParticipants > 0 ? market.maxParticipants : 30;

  // 같은 마켓 안에서 부스 번호가 너무 겹치지 않도록 몇 번 재시도
  let boothNumber = String(randInt(1, capacity));
  let key = `${market.marketId}:${boothNumber}`;
  for (let i = 0; i < 5 && usedBoothKeys.has(key); i += 1) {
    boothNumber = String(randInt(1, capacity));
    key = `${market.marketId}:${boothNumber}`;
  }
  usedBoothKeys.add(key);

  const status = pickStatus(market, today);
  const itemName = randomItemName();
  const title = maybe(randomBoothTitle(itemName), 0.7);
  const productDesc = maybe(randomProductDesc(itemName), 0.8);
  const itemImage = maybe(`/uploads/applications/seed-${randInt(1, 30)}.jpg`, 0.3);

  // 승인(Approved) 상태면 결제 대기중이라는 뜻이라 paymentDueAt을 채워줌
  // (과거 시각도 섞어서 "결제 기한 지남" 케이스도 테스트 가능하게 함)
  let paymentDueAt = null;
  if (status === 'Approved') {
    const dueOffsetHours = randInt(-48, 48);
    const due = new Date(today);
    due.setHours(due.getHours() + dueOffsetHours);
    paymentDueAt = due.toISOString().slice(0, 19).replace('T', ' ');
  }

  return [
    market.marketId,     // marketId
    pick(sellerIds),     // sellerId
    boothNumber,         // boothNumber
    title,               // title
    itemName,            // itemName
    productDesc,         // productDesc
    itemImage,           // itemImage
    status,              // status
    paymentDueAt,        // paymentDueAt
  ];
}

async function run() {
  const sellerIds = await getSellerIds();
  if (sellerIds.length === 0) {
    console.error('❌ userType=0(판매자)인 유저가 없어요. 먼저 판매자 계정을 만들거나 --seller=userId로 지정해주세요.');
    process.exit(1);
  }

  const markets = await getMarkets();
  if (markets.length === 0) {
    console.error('❌ markets가 하나도 없어요. seed-markets.js를 먼저 실행해주세요.');
    process.exit(1);
  }

  console.log(`👤 판매자로 사용할 유저 ${sellerIds.length}명 확인됨`);
  console.log(`🏟️  대상 마켓 ${markets.length}개 확인됨`);
  console.log(`🌱 applications 더미 데이터 ${TOTAL_COUNT}개 생성 시작...`);

  const today = new Date();
  const usedBoothKeys = new Set();

  const columns = `
    marketId, sellerId, boothNumber, title, itemName, productDesc, itemImage, status, paymentDueAt
  `;

  let inserted = 0;
  for (let offset = 0; offset < TOTAL_COUNT; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, TOTAL_COUNT - offset);
    const rows = Array.from({ length: batchCount }, () =>
      buildRow(sellerIds, markets, usedBoothKeys, today)
    );
    const placeholders = rows.map(() => `(${Array(9).fill('?').join(',')})`).join(',');
    const values = rows.flat();

    await pool.query(`INSERT INTO applications (${columns}) VALUES ${placeholders}`, values);
    inserted += batchCount;
    console.log(`  ...${inserted}/${TOTAL_COUNT}개 삽입 완료`);
  }

  console.log('-----------------------------------------');
  console.log(`✅ applications ${inserted}개 삽입 완료!`);
  console.log('   (payments/market_reviews는 건드리지 않았어요. 결제/리뷰 연동 데이터가 필요하면 별도로 알려주세요.)');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 더미 데이터 생성 중 오류:', err.message);
  process.exit(1);
});
