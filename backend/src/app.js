const express = require('express');
const cors = require('cors');
require('dotenv').config(); // .env 파일 설정 활성화

const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// 1. 미들웨어 설정
app.use(cors()); // 프론트엔드 포트가 달라도 통신이 가능하도록 CORS 허용
app.use(express.json()); // JSON 형식의 request body 해석 활성화
app.use(express.urlencoded({ extended: true }));

// 2. API 라우터 등록
// 모든 회원/인증 관련 API 주소는 /api/auth로 시작하게 설정됩니다.
app.use('/api/auth', authRoutes);

// 3. 기본 상태 점검용 라우터 (서버 정상 작동 확인)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: '플리마켓 백엔드 서버가 살아있습니다.' });
});

// 4. 에러 핸들러 미들웨어 (존재하지 않는 페이지 처리)
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: '존재하지 않는 API 경로입니다.' });
});

// 5. 서버 포트 리스닝 시작
app.listen(PORT, () => {
  console.log(`🚀 서버 구동 완료: http://localhost:${PORT}`);
});

module.exports = app;