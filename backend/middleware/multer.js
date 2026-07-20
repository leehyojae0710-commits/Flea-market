import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'Z:/markets/');
    },
    filename: (req, file, cb) => {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(originalName);
        const nameWithoutExt = path.basename(originalName, ext);

        const uniqueName = `${nameWithoutExt}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

export default upload;