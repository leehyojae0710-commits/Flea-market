import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'Z:/markets/');
    },
    filename: (req, file, cb) => {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(originalName);
        if(ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
            return cb(new Error('.jpg, .jpeg,.png 만 업로드 가능합니다.'));
        }
        const nameWithoutExt = path.basename(originalName, ext);

        const uniqueName = `${nameWithoutExt}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

// Windows 폴더명으로 쓸 수 없는 문자(\ / : * ? " < > |)를 제거하고,
// 끝에 오는 마침표/공백도 정리합니다. 값이 없으면 'untitled' 폴더로 모아둡니다.
function sanitizeFolderName(name) {
    if (!name) return 'untitled';
    const cleaned = String(name).replace(/[\\/:*?"<>|]/g, '').trim().replace(/[. ]+$/, '');
    return cleaned || 'untitled';
}

// [추가] 부스 신청 시 판매 물품 대표 이미지 업로드용.
// marketImage와 같은 드라이브(Z:/markets/) 아래, "부스 이름"을 폴더명으로 삼아 저장합니다.
// 예: Z:/markets/민지네 빈티지샵/cat-mascot-feline_24877-83979_1784594536570.jpg
// ⚠️ multer 특성상 destination 콜백에서 req.body를 읽으려면, 프론트에서 FormData에
//    title 필드를 itemImage(파일) 필드보다 "먼저" append 해야 합니다.
const itemImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const folderName = sanitizeFolderName(req.body?.title);
        const dir = path.join('Z:/markets/', folderName);
        fs.mkdirSync(dir, { recursive: true });
        // 실제 업로드 경로를 라우트 핸들러에서도 그대로 쓸 수 있도록 req에 기록해둡니다.
        req.uploadedItemFolder = folderName;
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(originalName);
        if(ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
            return cb(new Error('.jpg, .jpeg,.png 만 업로드 가능합니다.'));
        }
        const nameWithoutExt = path.basename(originalName, ext);

        const uniqueName = `${nameWithoutExt}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    }
});

export const uploadItemImage = multer({ storage: itemImageStorage });

export default upload;