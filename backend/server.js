// backend/server.js
import express from 'express';
// 📌 auth.js 대신 실제 파일명인 authRoutes.js로 경로를 변경합니다!
import authRoutes from './routes/authRoutes.js'; 

const app = express();
const PORT = 5000;

app.use(express.json());

// 라우터 주소 매핑
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('플리마켓 3주 완성 프로젝트 백엔드 임시 서버 작동 중!');
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 달리는 중입니다! 🏃‍♂️`);
});