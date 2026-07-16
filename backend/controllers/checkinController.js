// backend/controllers/checkinController.js
// 담당 E: 사전 등록/체크인용 QR 코드 발급

import QRCode from 'qrcode';
import pool from '../config/db.js';

// GET /api/checkins/:userId/qrcode (로그인 필요, 본인 것만 발급)
export async function generateEntranceQRCode(req, res) {
  const requester = req.user.userId;
  const { userId } = req.params;

  if (Number(requester) !== Number(userId)) {
    return res.status(403).json({ success: false, data: null, message: '본인의 QR 코드만 발급받을 수 있습니다.' });
  }

  try {
    const [rows] = await pool.query('SELECT userId FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: '사용자를 찾을 수 없습니다.' });
    }

    const payload = `checkin:${userId}`;
    const qrImageDataUrl = await QRCode.toDataURL(payload);

    return res.status(200).json({
      success: true,
      data: { userId: Number(userId), payload, qrImage: qrImageDataUrl },
      message: 'QR 코드가 발급되었습니다.',
    });
  } catch (error) {
    console.error('QR 코드 발급 오류:', error.message);
    return res.status(500).json({ success: false, data: null, message: '서버 오류로 QR 코드 발급에 실패했습니다.' });
  }
}
