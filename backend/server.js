// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import marketRoutes from './routes/marketRoutes.js';
import applicationRoutes from './routes/applicationRoutes.js';
import payRoutes from './routes/payRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import checkinRoutes from './routes/checkinRoutes.js';
import pool from './config/db.js'; // DB 데이터를 가져오기 위해 연결 풀을 불러옵니다.
import swaggerSpec from './config/swagger.js';
import upload  from './middleware/multer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); // 프론트(5500 등 다른 포트)에서 오는 요청 허용
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/payments', payRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec)); // http://localhost:5000/api-docs
app.use('/api/uploads', express.static('Z:/markets/'));

// 🌐 http://localhost:5000 접속 시 DB 데이터를 HTML 표로 보여주는 라우터
app.get('/', async (req, res) => {
  try {
    // 1. 각 테이블의 데이터 전원 소환
    const [users] = await pool.query('SELECT * FROM users');
    const [markets] = await pool.query('SELECT * FROM markets');
    const [applications] = await pool.query('SELECT * FROM applications');

    // 2. 브라우저에 그려줄 HTML 화면 작성 (Bootstrap 디자인 적용)
    let html = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <title>플리마켓 로컬 DB 데이터 모니터링</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          body { padding: 30px; background-color: #f8f9fa; }
          h2 { margin-top: 40px; margin-bottom: 15px; color: #333; font-weight: bold; border-left: 5px solid #0d6efd; padding-left: 10px; }
          .table-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="text-center my-4 text-primary">📊 플리마켓 프로젝트 실시간 DB 데이터 모니터링</h1>
          <p class="text-center text-muted">현재 내 로컬 MySQL 데이터베이스에 적재된 임시 데이터 목록입니다.</p>
          
          <!-- 1. 회원 테이블 -->
          <h2>1. 회원 테이블 (users)</h2>
          <div class="table-container table-responsive">
            <table class="table table-striped table-hover align-middle">
              <thead class="table-dark">
                <tr>
                  <th>userType</th><th>password</th><th>phone</th><th>email</th><th>region</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td><span class="badge ${u.userType === 1 ? 'bg-danger' : 'bg-success'}">${u.userType === 1 ? '1 (주최자)' : '0 (판매자)'}</span></td>
                    <td>${u.password}</td>
                    <td>${u.phone}</td>
                    <td>${u.email}</td>
                    <td>${u.region}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- 2. 마켓 공고 테이블 -->
          <h2>2. 마켓 공고 테이블 (markets)</h2>
          <div class="table-container table-responsive">
            <table class="table table-striped table-hover align-middle">
              <thead class="table-dark">
                <tr>
                  <th>marketId</th><th>hostId</th><th>title</th><th>description</th><th>marketImage</th><th>locationName</th><th>좌표(위도/경도)</th><th>eventDate</th><th>isExpired</th>
                </tr>
              </thead>
              <tbody>
                ${markets.map(m => `
                  <tr>
                    <td>${m.marketId}</td>
                    <td>${m.hostId}</td>
                    <td><strong>${m.title}</strong></td>
                    <td>${m.description}</td>
                    <td><code>${m.marketImage || ''}</code></td>
                    <td>${m.locationName}</td>
                    <td>${m.latitude}, ${m.longitude}</td>
                    <td>${new Date(m.eventDate_min).toLocaleDateString()} ~ ${new Date(m.eventDate_max).toLocaleDateString()}</td>
                    <td>${m.isExpired ? '❌ 마감' : '✅ 모집중'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- 3. 부스 신청 테이블 -->
          <h2>3. 부스 신청 테이블 (applications)</h2>
          <div class="table-container table-responsive">
            <table class="table table-striped table-hover align-middle">
              <thead class="table-dark">
                <tr>
                  <th>applicationId</th><th>marketId</th><th>sellerId</th><th>boothNumber</th><th>itemName</th><th>itemImage</th><th>status</th>
                </tr>
              </thead>
              <tbody>
                ${applications.map(a => `
                  <tr>
                    <td>${a.applicationId}</td>
                    <td>${a.marketId}</td>
                    <td>${a.sellerId}</td>
                    <td><span class="badge bg-secondary">${a.boothNumber}</span></td>
                    <td><strong>${a.itemName}</strong></td>
                    <td><code>${a.itemImage || ''}</code></td>
                    <td>
                      <span class="badge ${a.status === 'Approved' ? 'bg-success' : 'bg-warning text-dark'}">
                        ${a.status}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

        </div>
      </body>
      </html>
    `;

    // 3. 브라우저로 HTML 전송
    res.send(html);

  } catch (error) {
    console.error("웹 화면 조회 중 오류 발생:", error);
    res.status(500).send(`<h3>❌ DB 데이터를 가져오는 중 에러가 발생했습니다.</h3><p>${error.message}</p>`);
  }
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 달리는 중입니다! 🏃‍♂️`);
});

app.post('/api/upload', upload.single('marketImage'), (req, res) => {
  if (!req.file) {
    return console.log('No file uploaded');
  }
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ success: true, filePath });
});

async function updateExpiredMarkets() {
  try {
    const [result] = await pool.query(`
      UPDATE markets
      SET isExpired = 1
      WHERE eventDate_max < CURDATE() AND isExpired = 0
    `);
    console.log(`✅ 만료 마켓 갱신: ${result.affectedRows}개`);
  } catch (error) {
    console.error('❌ 만료 갱신 오류:', error);
  }
}
//서버 키면 market 테이블에서 eventDate_max < 오늘 날짜인 마켓들을 isExpired = 1로 갱신합니다.
updateExpiredMarkets();