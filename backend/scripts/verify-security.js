// backend/scripts/verify-security.js
// [보안·환경 정리] 비밀 정보와 하드코딩이 저장소에 남아 있는지 점검합니다.
//
// 실행: cd backend && node scripts/verify-security.js
//       (DB·서버 불필요. git 이 없으면 파일 존재 여부로만 검사합니다.)
//
// 배포 전(WBS 5.1/5.3)과 코드 제출 전에 한 번씩 돌려 보세요.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');

let pass = 0;
const problems = [];

function check(label, ok, fix = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    problems.push({ label, fix });
    console.log(`  ❌ ${label}`);
    if (fix) console.log(`      → ${fix}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}`);
}

/** git 이 추적 중인 파일 목록. git 이 없거나 저장소가 아니면 null */
function gitTrackedFiles() {
  try {
    const out = execSync('git ls-files', { cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (error) {
    return null;
  }
}

console.log('\n═══ 보안·환경 점검 ═══');

/* ------------------------------------------------------------------ */
/* 1. 비밀 파일이 git 에 올라가 있는지                                 */
/* ------------------------------------------------------------------ */

section('1. 비밀 파일 추적 여부');

const tracked = gitTrackedFiles();

if (tracked === null) {
  console.log('  ℹ️  git 저장소가 아니거나 git 이 없어 추적 여부는 건너뜁니다. (파일 존재 여부만 검사)');
} else {
  const secretLike = tracked.filter((f) => {
    const base = path.basename(f);
    if (base === '.env.example') return false;
    return base === '.env' || base.startsWith('.env.') || base.endsWith('.env');
  });

  check(
    '.env 계열 파일이 git 에 추적되지 않는다',
    secretLike.length === 0,
    secretLike.length === 0 ? '' :
      `추적 중: ${secretLike.join(', ')}\n         해결: git rm --cached ${secretLike.join(' ')} 후 커밋`
  );

  const dumps = tracked.filter((f) => /\.sql$/i.test(path.basename(f)) && /backup|dump/i.test(path.basename(f)));
  check('DB 백업 파일이 git 에 추적되지 않는다', dumps.length === 0,
    dumps.length === 0 ? '' : `추적 중: ${dumps.join(', ')}`);
}

// git 유무와 무관하게, 작업 폴더에 남아 있는 비밀 파일도 알려 줍니다.
const strayEnvFiles = fs.readdirSync(BACKEND_ROOT)
  .filter((f) => f !== '.env' && f !== '.env.example' && (f.startsWith('.env') || f.endsWith('.env')));

check('backend 에 정체불명의 .env 변형 파일이 없다', strayEnvFiles.length === 0,
  strayEnvFiles.length === 0 ? '' :
    `발견: ${strayEnvFiles.join(', ')}\n         .env 하나로 합치고 나머지는 삭제하세요.`);

/* ------------------------------------------------------------------ */
/* 2. .gitignore 규칙                                                  */
/* ------------------------------------------------------------------ */

section('2. .gitignore 규칙');

for (const rel of ['.gitignore', 'backend/.gitignore']) {
  const full = path.join(PROJECT_ROOT, rel);
  if (!fs.existsSync(full)) {
    check(`${rel} 존재`, false, '파일을 만들어 주세요.');
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  check(`${rel} 가 .env 변형까지 막는다`,
    text.includes('.env.*') || text.includes('*.env'),
    '`.env` 한 줄만 있으면 `.env.txt.env` 같은 파일이 그대로 커밋됩니다.');
}

/* ------------------------------------------------------------------ */
/* 3. 예시 파일에 실제 값이 없는지                                     */
/* ------------------------------------------------------------------ */

section('3. .env.example 위생');

const examplePath = path.join(BACKEND_ROOT, '.env.example');
if (!fs.existsSync(examplePath)) {
  check('.env.example 존재', false, '팀원이 .env 를 만들 수 없습니다.');
} else {
  const example = fs.readFileSync(examplePath, 'utf8');
  check('.env.example 에 JWT_SECRET 실제 값이 적혀 있지 않다',
    /^\s*JWT_SECRET\s*=\s*$/m.test(example),
    'JWT_SECRET= 처럼 값을 비워 두세요. 예시 값을 그대로 쓰는 사람이 반드시 생깁니다.');
  check('.env.example 에 DB_PASSWORD 실제 값이 적혀 있지 않다',
    /^\s*DB_PASSWORD\s*=\s*$/m.test(example));
}

/* ------------------------------------------------------------------ */
/* 4. 코드 내 하드코딩                                                 */
/* ------------------------------------------------------------------ */

section('4. 하드코딩된 서버 주소');

const frontendRoot = path.join(PROJECT_ROOT, 'frontend');
const ALLOW_FILE = path.join(frontendRoot, 'common', 'js', 'api.js'); // 폴백 1곳만 허용

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|html)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(frontendRoot)) {
  if (file === ALLOW_FILE) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|<!--)/.test(line)) return; // 주석은 제외
    if (/https?:\/\/(localhost|127\.0\.0\.1|192\.168\.)[^\s'"`]*/.test(line)) {
      offenders.push(`${path.relative(PROJECT_ROOT, file)}:${i + 1}`);
    }
  });
}

check(`프론트에 하드코딩된 서버 주소가 없다 (api.js 폴백 제외)`,
  offenders.length === 0,
  offenders.length === 0 ? '' :
    `발견 ${offenders.length}곳: ${offenders.slice(0, 8).join(', ')}\n         apiUrl('/경로') 를 쓰세요.`);

/* ------------------------------------------------------------------ */
/* 5. 실행 중인 .env 값                                                */
/* ------------------------------------------------------------------ */

section('5. 현재 .env 값');

const envPath = path.join(BACKEND_ROOT, '.env');
if (!fs.existsSync(envPath)) {
  console.log('  ℹ️  backend/.env 가 없습니다. (.env.example 을 복사해 만드세요)');
} else {
  const env = fs.readFileSync(envPath, 'utf8');
  const get = (key) => {
    const m = env.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };

  const secret = get('JWT_SECRET');
  check('JWT_SECRET 이 예제 기본값이 아니다',
    secret !== '' && secret !== 'flea-market-dev-secret-change-me',
    '아래 명령으로 새 값을 만들어 넣으세요.\n         node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
  check('JWT_SECRET 이 32자 이상이다', secret.length >= 32);
}

/* ------------------------------------------------------------------ */

console.log(`\n═══ 결과: 통과 ${pass}건 / 조치 필요 ${problems.length}건 ═══`);

if (problems.length > 0) {
  console.log('\n조치가 필요한 항목');
  problems.forEach((p) => console.log(`  ❌ ${p.label}`));
  console.log('\n자세한 절차는 보안정리_안내.md 를 보세요.');
  process.exitCode = 1;
} else {
  console.log('\n🎉 보안·환경 점검을 모두 통과했습니다.');
}
