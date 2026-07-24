// backend/services/paymentService.js
import axios from 'axios';

const PORTONE_API = 'https://api.portone.io';

export async function verifyPayment(paymentId) {
    console.log(PORTONE_API);
  try {
    const response = await axios.get(
      `${PORTONE_API}/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    // 포트원 API 자체가 에러를 줄 때(존재하지 않는 paymentId 등)도 명확한 에러로 던지기
    console.error('PortOne 결제 조회 오류:', error.response?.data || error.message);
    throw new Error('결제 정보를 조회할 수 없습니다.');
  }
}