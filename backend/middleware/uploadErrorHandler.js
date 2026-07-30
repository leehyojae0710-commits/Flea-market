// backend/middleware/uploadErrorHandler.js
// [신규] multer 업로드 실패를 400 + 한국어 메시지로 돌려주는 래퍼.
//
// 문제
//   `upload.single('x')` 를 그대로 라우트에 붙이면, 용량 초과나 확장자 오류가 났을 때
//   에러가 Express 기본 핸들러로 흘러가 500(또는 빈 응답)이 나갑니다.
//   프론트는 `data.message` 를 읽으므로 사용자에게 아무 안내도 못 해줬습니다.
//
// 사용법
//   app.post('/api/upload/profile-image',
//     authenticateToken,
//     handleUpload(uploadProfileImage.single('profileImage')),
//     (req, res) => { ... });

import multer from 'multer';

// 프론트 안내 문구와 숫자를 맞추기 위해 여기서도 같은 값을 씁니다.
export const UPLOAD_MAX_MB = 5;

export function handleUpload(uploadMiddleware) {
  return function (req, res, next) {
    uploadMiddleware(req, res, (err) => {
      if (!err) return next();

      let message = '이미지 업로드에 실패했습니다.';

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          message = `이미지 용량은 ${UPLOAD_MAX_MB}MB 이하만 올릴 수 있습니다.`;
        } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          message = '이미지는 한 번에 한 장만 올릴 수 있습니다.';
        } else {
          message = `업로드 중 오류가 발생했습니다. (${err.code})`;
        }
      } else if (err && err.message) {
        // fileFilter 에서 우리가 직접 던진 메시지(확장자/형식 안내)를 그대로 전달합니다.
        message = err.message;
      }

      console.warn('업로드 실패:', err.message);
      return res.status(400).json({ success: false, data: null, message });
    });
  };
}
