// backend/scripts/check-schema.js
// [진단 스크립트] 지금 DB에 무엇이 있고 무엇이 빠졌는지 한눈에 보여줍니다.
//
// 기능이 "에러도 없이 안 되는" 경우는 거의 컬럼이 없어서입니다.
// 코드는 없는 컬럼을 만나면 그 기능만 조용히 끄도록 되어 있어서,
// 화면에는 아무 문제가 없어 보이지만 값이 저장되지 않습니다.
// 이 스크립트로 무엇을 실행해야 하는지 바로 확인하세요.
//
// 실행: cd backend && node scripts/check-schema.js
//   읽기만 합니다. DB 를 바꾸지 않습니다.

import pool from '../config/db.js';

const CHECKS = [
  {
    label: '부스 종류',
    table: 'market_booth_types',
    columns: ['name', 'price', 'capacity', 'sortOrder', 'isActive'],
    migration: 'node scripts/migrate-add-booth-types.js',
    effect: {
      capacity: '부스 종류별 수량이 저장되지 않고 0(제한 없음)으로만 남습니다.',
    },
  },
  {
    label: '신청',
    table: 'applications',
    columns: ['boothTypeId', 'approvedPrice'],
    migration: 'node scripts/migrate-add-booth-types.js',
    effect: {
      boothTypeId: '판매자가 고른 부스 종류가 저장되지 않습니다.',
      approvedPrice: '승인 시점 금액 고정이 동작하지 않아, 주최자가 가격을 바꾸면 결제 금액도 같이 바뀝니다.',
    },
  },
  {
    label: '마켓 옵션',
    table: 'markets',
    columns: ['allowOvercapacity', 'allowDuplicateApplication', 'maxParticipants'],
    migration: 'node scripts/migrate-add-market-options.js',
    effect: {
      allowOvercapacity: '「초과 신청 허용」 설정이 저장되지 않습니다.',
      allowDuplicateApplication: '「중복 신청 허용」 설정이 저장되지 않습니다.',
      maxParticipants: '정원 검사가 동작하지 않습니다.',
    },
  },
  {
    label: '결제',
    table: 'payments',
    columns: ['paymentKey', 'refundAmount', 'refundReason'],
    migration: '(수동 추가 필요 — 팀 DB 담당자에게 문의)',
    effect: {
      paymentKey: '환불 시 결제사 호출을 건너뛰어 실제 돈이 빠져나가지 않습니다.',
      refundAmount: '환불 금액이 기록되지 않습니다.',
      refundReason: '환불 사유가 기록되지 않습니다.',
    },
  },
  {
    label: '역할 전환',
    table: 'users',
    columns: ['activeRole'],
    migration: 'node scripts/migrate-add-active-role.js',
    effect: {
      activeRole: '주최자/판매자 역할 전환이 저장되지 않습니다.',
    },
  },
];

async function tableExists(table) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`, [table]);
  return row.cnt > 0;
}

/** 실제 컬럼명을 소문자 키로 매핑해서 돌려줍니다. (대소문자 표기 차이 흡수) */
async function columnMap(table) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?`, [table]);
  return new Map(rows.map((r) => [String(r.c).toLowerCase(), r.c]));
}

async function run() {
  const [[info]] = await pool.query('SELECT DATABASE() AS db, VERSION() AS ver');
  console.log(`\n▶ 대상 DB : ${info.db} (MySQL ${info.ver})`);
  console.log('  .env 의 DB_HOST / DB_NAME 이 백엔드가 쓰는 DB 와 같은지 확인하세요.');
  console.log('='.repeat(60));

  const todo = new Set();
  let missingCount = 0;

  for (const check of CHECKS) {
    const exists = await tableExists(check.table);
    console.log(`\n[${check.label}]  ${check.table}`);

    if (!exists) {
      console.log('  ❌ 테이블 자체가 없습니다.');
      todo.add(check.migration);
      missingCount += check.columns.length;
      continue;
    }

    const cols = await columnMap(check.table);
    for (const want of check.columns) {
      const real = cols.get(want.toLowerCase());
      if (real) {
        // 표기가 다르면 알려줍니다. (코드가 소문자로 대조하다 실패한 전례가 있습니다)
        const note = real === want ? '' : `  (실제 표기: ${real})`;
        console.log(`  ✅ ${want}${note}`);
      } else {
        missingCount += 1;
        console.log(`  ❌ ${want} 없음`);
        if (check.effect[want]) console.log(`       → ${check.effect[want]}`);
        todo.add(check.migration);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  if (missingCount === 0) {
    console.log('✅ 필요한 테이블·컬럼이 모두 있습니다.');
    console.log('   그런데도 값이 저장되지 않는다면, 마이그레이션 이후 서버를 재시작하지 않았을 수 있습니다.');
    console.log('   (백엔드가 스키마 상태를 잠시 캐시합니다 — 재시작하면 즉시 반영됩니다)');
  } else {
    console.log(`⚠ 빠진 항목 ${missingCount}개. 아래를 실행한 뒤 서버를 재시작하세요.\n`);
    for (const cmd of todo) console.log(`   ${cmd}`);
    console.log('\n   실행 후 이 스크립트를 다시 돌려 전부 ✅ 인지 확인하세요.');
  }
  console.log('='.repeat(60));
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ 진단 중 오류:', err.message);
  process.exit(1);
});
