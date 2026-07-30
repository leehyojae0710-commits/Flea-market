// backend/utills/profileImageStore.js
// [신규] 프로필 사진 / 소개 이미지의 실제 파일을 안전하게 정리하기 위한 유틸.
//
// 왜 필요한가
//   프로필 이미지를 바꾸거나 삭제하면 DB 경로만 바뀌고 예전 파일은 디스크에 그대로 남았습니다.
//   계속 쌓이면 저장소가 지저분해지므로, 더 이상 쓰지 않는 파일을 지웁니다.
//
// 안전장치
//   삭제 대상은 "/uploads/{본인 userId}/파일명" 형태만 허용합니다.
//   다른 사람 폴더(/uploads/99/...)나 상위 경로(../)를 가리키는 값은 전부 무시합니다.
//   multer.js 의 profileImageStorage 와 같은 폴더 규칙(Z:/profile/{userId}/)을 씁니다.

import fs from 'fs';
import path from 'path';

export const PROFILE_UPLOAD_ROOT = 'Z:/profile/';

/**
 * 공개 경로(/uploads/{userId}/{파일명})를 실제 파일 경로로 바꿉니다.
 * 규칙에 맞지 않으면 null 을 돌려줘서 아무것도 지우지 않게 합니다.
 */
export function resolveProfileImagePath(userId, publicPath) {
  if (!publicPath || typeof publicPath !== 'string') return null;

  const expectedPrefix = `/uploads/${userId}/`;
  if (!publicPath.startsWith(expectedPrefix)) return null;

  const fileName = publicPath.slice(expectedPrefix.length);
  // 파일명만 허용합니다. 하위 폴더나 상위 이동(..)이 섞이면 거부합니다.
  if (!fileName) return null;
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return null;

  const dir = path.resolve(PROFILE_UPLOAD_ROOT, String(userId));
  const full = path.resolve(dir, fileName);

  // 한 번 더 확인: 반드시 본인 폴더 안이어야 합니다.
  if (!full.startsWith(dir + path.sep)) return null;
  return full;
}

/**
 * 더 이상 쓰지 않는 이미지 파일을 지웁니다.
 * 파일이 없거나 삭제에 실패해도 예외를 던지지 않습니다. (프로필 저장 자체는 성공 처리)
 */
export function removeProfileImageFile(userId, publicPath) {
  const full = resolveProfileImagePath(userId, publicPath);
  if (!full) return false;

  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      return true;
    }
  } catch (error) {
    console.warn('이전 프로필 이미지 삭제 실패(무시하고 계속):', error.message);
  }
  return false;
}
