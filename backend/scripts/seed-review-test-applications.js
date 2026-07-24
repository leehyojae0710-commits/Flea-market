// backend/scripts/seed-review-test-applications.js
// [추가] "행사 평가하기(별점)" 기능을 테스트하기 위한 부스 신청 더미 데이터를 생성합니다.
// userType = 0(판매자) 유저마다 아래 5가지 상태를 하나씩 만들어서, mybooth 화면에서
// 버튼/별점 UI가 상태별로 어떻게 보이는지 한 번에 확인할 수 있게 합니다.
//
//   1. Approved + 행사 종료됨 + 미평가   -> "행사 평가하기" 버튼 활성화
//   2. Approved + 행사 종료됨 + 평가완료 -> 채워진 별점(읽기전용) 표시
//   3. Approved + 행사 진행중/예정       -> 버튼 비활성화 + 툴팁
//   4. Pending                          -> 평가 UI 자체가 안 보임
//   5. Rejected                         -> 평가 UI 자체가 안 보임
//
// 여러 번 실행해도 안전합니다 (매번 새 신청 건을 추가하는 방식이라 중복 실행돼도 에러는 안 나지만,
// 데이터가 계속 쌓이는 게 싫으면 --seller 옵션으로 한 명만 지정해서 쓰세요).
//
// 실행:
//   cd backend && node scripts/seed-review-test-applications.js
//   특정 판매자 1명만: node scripts/seed-review-test-applications.js --seller=2
//   평가완료 케이스의 별점 값 지정: node scripts/seed-review-test-applications.js --rating=4

import pool from '../config/db.js';

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
}

const ONLY_SELLER_ID = getArg('seller', null);
const RATED_SCORE = Number(getArg('rating', 4));

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

async function getSellers() {
  if (ONLY_SELLER_ID) {
    const [rows] = await pool.query(
      `SELECT userId, email FROM users WHERE userId = ? AND userType = 0`,
      [ONLY_SELLER_ID]
    );
    return rows;
  }
  const [rows] = await pool.query(`SELECT userId, email FROM users WHERE userType = 0`);
  return rows;
}

async function getMarkets() {
  const [ended] = await pool.query(
    `SELECT marketId, title FROM markets WHERE eventDate_max < CURDATE() ORDER BY RAND() LIMIT 50`
  );
  const [upcoming] = await pool.query(
    `SELECT marketId, title FROM markets WHERE eventDate_max >= CURDATE() OR eventDate_max IS NULL ORDER BY RAND() LIMIT 50`
  );
  return { ended, upcoming };
}

async function insertApplication({ marketId, sellerId, boothNumber, itemName, productDesc, title, status }) {
  const [result] = await pool.query(
    `INSERT INTO applications (marketId, sellerId, boothNumber, itemName, productDesc, title, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [marketId, sellerId, boothNumber, itemName, productDesc, title, status]
  );
  return result.insertId;
}

async function insertReview({ applicationId, marketId, sellerId, rating }) {
  await pool.query(
    `INSERT INTO market_reviews (applicationId, marketId, sellerId, rating) VALUES (?, ?, ?, ?)`,
    [applicationId, marketId, sellerId, rating]
  );
}

async function run() {
  const sellers = await getSellers();
  if (sellers.length === 0) {
    console.error('❌ userType=0(판매자)인 유저를 찾지 못했어요. --seller=userId 로 직접 지정하거나, 판매자 계정을 먼저 만들어주세요.');
    process.exit(1);
  }

  const { ended, upcoming } = await getMarkets();
  if (ended.length === 0) {
    console.error('❌ eventDate_max가 지난(행사 종료된) market이 하나도 없어요. seed-markets.js를 먼저 실행해서 마켓 더미 데이터를 만들어주세요.');
    process.exit(1);
  }
  if (upcoming.length === 0) {
    console.warn('⚠️  아직 안 끝난 market이 없어서, "비활성 버튼" 케이스는 종료된 market으로 대체해서 만들게요. (그 케이스만 버튼이 정상 동작하지 않을 수 있어요)');
  }

  console.log(`👤 판매자 ${sellers.length}명 대상으로 진행합니다.`);
  console.log(`🏟️  종료된 market ${ended.length}개, 진행중/예정 market ${upcoming.length}개 확보`);
  console.log(`⭐ "평가완료" 케이스의 별점: ${RATED_SCORE}점`);
  console.log('-----------------------------------------');

  let createdApplications = 0;
  let createdReviews = 0;

  for (const seller of sellers) {
    const sellerId = seller.userId;
    const tag = randInt(1000, 9999); // 판매자/실행마다 boothNumber가 겹치지 않게

    // 1) Approved + 종료됨 + 미평가 -> "행사 평가하기" 버튼 활성화
    const market1 = pick(ended);
    const app1 = await insertApplication({
      marketId: market1.marketId,
      sellerId,
      boothNumber: `T${tag}A`,
      itemName: '[평가테스트] 미평가 승인 부스',
      productDesc: '행사가 종료된 승인 부스입니다. "행사 평가하기" 버튼이 활성화되어야 합니다.',
      title: '평가 가능 - 미평가',
      status: 'Approved',
    });
    createdApplications += 1;

    // 2) Approved + 종료됨 + 평가완료 -> 채워진 별점(읽기전용) 표시
    const market2 = pick(ended);
    const app2 = await insertApplication({
      marketId: market2.marketId,
      sellerId,
      boothNumber: `T${tag}B`,
      itemName: '[평가테스트] 평가완료 승인 부스',
      productDesc: '행사가 종료되고 이미 평가까지 남긴 승인 부스입니다. 별점이 읽기전용으로 표시되어야 합니다.',
      title: '평가 완료',
      status: 'Approved',
    });
    await insertReview({ applicationId: app2, marketId: market2.marketId, sellerId, rating: RATED_SCORE });
    createdApplications += 1;
    createdReviews += 1;

    // 3) Approved + 진행중/예정 -> 버튼 비활성화 + 툴팁
    const market3 = upcoming.length > 0 ? pick(upcoming) : pick(ended);
    const app3 = await insertApplication({
      marketId: market3.marketId,
      sellerId,
      boothNumber: `T${tag}C`,
      itemName: '[평가테스트] 미종료 승인 부스',
      productDesc: '아직 행사가 끝나지 않은 승인 부스입니다. "행사 평가하기" 버튼이 비활성화(툴팁 안내)되어야 합니다.',
      title: '평가 불가 - 미종료',
      status: 'Approved',
    });
    createdApplications += 1;

    // 4) Pending -> 평가 UI 자체가 안 보임
    const market4 = pick([...ended, ...upcoming]);
    await insertApplication({
      marketId: market4.marketId,
      sellerId,
      boothNumber: `T${tag}D`,
      itemName: '[평가테스트] 대기중 부스',
      productDesc: '아직 승인/반려되지 않은 대기중 부스입니다.',
      title: '대기중',
      status: 'Pending',
    });
    createdApplications += 1;

    // 5) Rejected -> 평가 UI 자체가 안 보임
    const market5 = pick([...ended, ...upcoming]);
    await insertApplication({
      marketId: market5.marketId,
      sellerId,
      boothNumber: `T${tag}E`,
      itemName: '[평가테스트] 반려된 부스',
      productDesc: '반려된 부스입니다. 평가 UI가 보이면 안 됩니다.',
      title: '반려됨',
      status: 'Rejected',
    });
    createdApplications += 1;

    console.log(`  ✓ sellerId=${sellerId}(${seller.email}) 5건 생성 완료 (신청 #${app1}, #${app2}[평가완료], #${app3}, ...)`);
  }

  console.log('-----------------------------------------');
  console.log(`✅ applications ${createdApplications}건, market_reviews ${createdReviews}건 생성 완료!`);
  console.log('   마이페이지(mybooth) > "승인됨" 탭에서 확인해보세요.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 더미 데이터 생성 중 오류:', err.message);
  process.exit(1);
});
