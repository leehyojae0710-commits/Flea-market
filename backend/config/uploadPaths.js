// backend/config/uploadPaths.js
// [신규] 업로드 폴더 경로를 한 곳에서 정합니다.
//
// 왜 필요한가
//   기존에는 'Z:/markets/', 'Z:/seller/', 'Z:/profile/' 이 여러 파일에 하드코딩돼 있었습니다.
//   Z: 는 팀 공유 네트워크 드라이브라서, 드라이브가 연결되지 않은 PC에서는
//     Error: ENOENT: no such file or directory, mkdir 'Z:\profile\1'
//   가 나면서 백엔드 프로세스가 통째로 죽었습니다.
//   (mkdirSync 의 recursive 옵션은 없는 "드라이브"까지 만들어 주지는 못합니다.)
//
// 해결
//   1) backend/.env 의 UPLOAD_ROOT 로 경로를 지정할 수 있습니다.
//   2) 지정이 없으면 Z:/ 를 쓰되, Z: 가 없으면 backend/uploads/ 로 자동 대체합니다.
//   3) 폴더 생성 실패는 예외 대신 Error 객체로 돌려줘서 서버가 죽지 않게 합니다.
//
// .env 예시
//   UPLOAD_ROOT=Z:/                     (팀 공유 드라이브를 쓰는 경우)
//   UPLOAD_ROOT=C:/flea-market-uploads  (내 PC 폴더를 쓰는 경우)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY_ROOT = 'Z:/'; // 기존 팀 공유 드라이브

let cachedRoot = null;

function isUsable(dir) {
  try {
    return fs.existsSync(dir);
  } catch {
    return false;
  }
}

/**
 * 업로드 루트 경로.
 * dotenv.config() 이후에 호출돼야 하므로 모듈 로드 시점이 아니라 처음 쓸 때 계산합니다.
 */
export function getUploadRoot() {
  if (cachedRoot) return cachedRoot;

  const configured = String(process.env.UPLOAD_ROOT || '').trim();

  if (configured) {
    cachedRoot = path.resolve(configured);
  } else if (isUsable(LEGACY_ROOT)) {
    cachedRoot = path.resolve(LEGACY_ROOT);
  } else {
    cachedRoot = path.join(BACKEND_DIR, 'uploads');
    console.warn('──────────────────────────────────────────────');
    console.warn('[업로드] Z: 드라이브를 찾을 수 없어 로컬 폴더를 사용합니다.');
    console.warn(`[업로드] 저장 위치: ${cachedRoot}`);
    console.warn('[업로드] 팀 공유 드라이브를 쓰려면 backend/.env 에 UPLOAD_ROOT=Z:/ 를 넣어주세요.');
    console.warn('──────────────────────────────────────────────');
  }

  return cachedRoot;
}

export function marketUploadDir() {
  return path.join(getUploadRoot(), 'markets');
}

export function sellerUploadDir() {
  return path.join(getUploadRoot(), 'seller');
}

export function profileUploadDir() {
  return path.join(getUploadRoot(), 'profile');
}

/**
 * 폴더를 만듭니다.
 * 성공하면 null, 실패하면 Error 를 돌려줍니다. (throw 하지 않습니다)
 * multer 의 destination 콜백 안에서 throw 하면 프로세스가 죽기 때문입니다.
 */
export function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return null;
  } catch (error) {
    console.error('[업로드] 폴더 생성 실패:', dir, '-', error.message);
    return new Error(
      `업로드 폴더를 만들 수 없습니다. (${dir}) backend/.env 의 UPLOAD_ROOT 설정을 확인해주세요.`
    );
  }
}
