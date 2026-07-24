// backend/scripts/seed-markets.js
// [추가] markets 테이블에 랜덤 더미 데이터 2000개를 생성해서 넣습니다.
// hostId는 users 테이블에서 실제 존재하는 "주최자(userType=1)" 유저 중 무작위로 골라서 사용합니다.
// (host 유저가 한 명도 없으면 안전하게 중단합니다.)
//
// 실행: cd backend && node scripts/seed-markets.js
//   개수 바꾸고 싶으면: node scripts/seed-markets.js 500

import pool from '../config/db.js';

const TOTAL_COUNT = Number(process.argv[2]) || 2000;
const BATCH_SIZE = 500; // 한 번에 넣을 row 수 (너무 크게 잡으면 max_allowed_packet 초과 가능)

// ---------- 랜덤 유틸 ----------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max, digits = 6) {
  return Number((Math.random() * (max - min) + min).toFixed(digits));
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function maybe(value, probabilityTrue) {
  return Math.random() < probabilityTrue ? value : null;
}
function formatDate(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------- 데이터 풀 ----------
const REGIONS = [
  { name: '서울', lat: 37.5665, lng: 126.9780 },
  { name: '부산', lat: 35.1796, lng: 129.0756 },
  { name: '대구', lat: 35.8714, lng: 128.6014 },
  { name: '인천', lat: 37.4563, lng: 126.7052 },
  { name: '광주', lat: 35.1595, lng: 126.8526 },
  { name: '대전', lat: 36.3504, lng: 127.3845 },
  { name: '울산', lat: 35.5384, lng: 129.3114 },
  { name: '세종', lat: 36.4801, lng: 127.2890 },
  { name: '경기', lat: 37.4138, lng: 127.5183 },
  { name: '강원', lat: 37.8228, lng: 128.1555 },
  { name: '충북', lat: 36.6357, lng: 127.4913 },
  { name: '충남', lat: 36.5184, lng: 126.8000 },
  { name: '전북', lat: 35.7175, lng: 127.1530 },
  { name: '전남', lat: 34.8161, lng: 126.4629 },
  { name: '경북', lat: 36.4919, lng: 128.8889 },
  { name: '경남', lat: 35.4606, lng: 128.2132 },
  { name: '제주', lat: 33.4996, lng: 126.5312 },
];

const KEYWORDS = [
  '빈티지', '플리', '아트', '로컬', '수제품', '핸드메이드', '친환경', '청년', '야시장',
  '벼룩', '소품', '푸드', '레트로', '북마켓', '반려동물', '커뮤니티', '주말', '문화',
];
const PLACE_TYPES = ['걷고싶은거리', '공원', '역 광장', '문화의거리', '해변로', '시장 골목', '체육공원', '광장', '컨벤션센터', '테크노밸리'];
const STREET_TYPES = ['로', '길', '대로', '거리'];

function randomTitle(regionName) {
  return `${regionName} ${pick(KEYWORDS)} 마켓 #${randInt(1, 9999)}`;
}
function randomLocationName(regionName) {
  return `${regionName} ${pick(PLACE_TYPES)} ${randInt(1, 300)}${pick(STREET_TYPES)}`;
}
function randomDescription(title) {
  return `${title}입니다. 다양한 셀러들이 참여하는 테스트용 더미 마켓 설명입니다.`;
}

// 오늘(today) 기준으로 -180일 ~ +180일 사이에서 markets 하나 분량의 날짜 세트를 만듦
function randomDatesAround(today) {
  const eventStartOffset = randInt(-180, 180);
  const eventDuration = randInt(0, 4); // 당일 ~ 4일짜리 행사
  const eventDate_min = addDays(today, eventStartOffset);
  const eventDate_max = addDays(eventDate_min, eventDuration);

  let recruitmentDate_min = null;
  let recruitmentDate_max = null;
  if (Math.random() < 0.7) {
    // 모집기간은 보통 행사 시작일보다 하루~30일 전에 마감
    const recruitEndOffset = randInt(1, 30);
    const recruitDuration = randInt(3, 20);
    recruitmentDate_max = addDays(eventDate_min, -recruitEndOffset);
    recruitmentDate_min = addDays(recruitmentDate_max, -recruitDuration);
  }

  return { eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max };
}

async function getHostUserIds() {
  const [rows] = await pool.query(`SELECT userId FROM users WHERE userType = 1`);
  return rows.map((r) => r.userId);
}

function buildRow(hostIds, today) {
  const region = pick(REGIONS);
  const title = randomTitle(region.name);
  const { eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max } = randomDatesAround(today);

  // 행사 종료일이 이미 지났으면 isExpired = 1일 확률을 높게
  const alreadyEnded = eventDate_max < today;
  const isExpired = alreadyEnded ? (Math.random() < 0.9 ? 1 : 0) : (Math.random() < 0.02 ? 1 : 0);

  return [
    pick(hostIds),                                              // hostId
    title,                                                       // title
    randomDescription(title),                                    // description
    maybe(`/uploads/markets/seed-${randInt(1, 40)}.jpg`, 0.4),    // marketImage
    randomLocationName(region.name),                              // locationName
    region.name,                                                  // region
    pick([0, 0, 3000, 5000, 8000, 10000, 15000, 20000]),          // boothPrice (0원 비중 높게)
    randFloat(region.lat - 0.15, region.lat + 0.15),              // latitude
    randFloat(region.lng - 0.15, region.lng + 0.15),              // longitude
    isExpired,                                                    // isExpired
    randInt(5, 60),                                               // maxParticipants
    formatDate(eventDate_min),                                    // eventDate_min
    formatDate(eventDate_max),                                    // eventDate_max
    recruitmentDate_min ? formatDate(recruitmentDate_min) : null, // recruitmentDate_min
    recruitmentDate_max ? formatDate(recruitmentDate_max) : null, // recruitmentDate_max
  ];
}

async function run() {
  const hostIds = await getHostUserIds();

  if (hostIds.length === 0) {
    console.error('❌ userType=1(주최자)인 유저가 한 명도 없어요. 먼저 주최자 계정을 만들어주세요.');
    process.exit(1);
  }

  console.log(`👤 주최자로 사용할 유저 ${hostIds.length}명 확인됨`);
  console.log(`🌱 markets 더미 데이터 ${TOTAL_COUNT}개 생성 시작...`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const columns = `
    hostId, title, description, marketImage, locationName, region, boothPrice,
    latitude, longitude, isExpired, maxParticipants,
    eventDate_min, eventDate_max, recruitmentDate_min, recruitmentDate_max
  `;

  let inserted = 0;
  for (let offset = 0; offset < TOTAL_COUNT; offset += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, TOTAL_COUNT - offset);
    const rows = Array.from({ length: batchCount }, () => buildRow(hostIds, today));
    const placeholders = rows.map(() => `(${Array(15).fill('?').join(',')})`).join(',');
    const values = rows.flat();

    await pool.query(`INSERT INTO markets (${columns}) VALUES ${placeholders}`, values);
    inserted += batchCount;
    console.log(`  ...${inserted}/${TOTAL_COUNT}개 삽입 완료`);
  }

  console.log('-----------------------------------------');
  console.log(`✅ markets ${inserted}개 삽입 완료!`);
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 더미 데이터 생성 중 오류:', err.message);
  process.exit(1);
});