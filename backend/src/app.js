// 백엔드 진입점 - 라우터를 여기서 하나로 모읍니다.
// 담당자별 라우트 파일을 만들면 여기서 app.use(...)로 등록만 해주면 됩니다.

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const marketRoutes = require('./routes/market.routes');
const applicationRoutes = require('./routes/application.routes');
const paymentRoutes = require('./routes/payment.routes');
const commentRoutes = require('./routes/comment.routes');
const scheduleRoutes = require('./routes/schedule.routes');

const app = express();
app.use(cors());
app.use(express.json());

// 응답 형식 통일: { success, data, message }
app.use('/api/auth', authRoutes);        // 담당 C
app.use('/api/users', authRoutes);       // 담당 C (회원정보 수정/탈퇴)
app.use('/api/markets', marketRoutes);   // 담당 C(조회) / D(등록, 신청목록)
app.use('/api/applications', applicationRoutes); // 담당 D
app.use('/api/payments', paymentRoutes); // 담당 D
app.use('/api/comments', commentRoutes); // 담당 D
app.use('/api/schedules', scheduleRoutes); // 담당 D

app.get('/', (req, res) => {
  res.json({ success: true, message: 'Flea-market API 서버 동작 중' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
