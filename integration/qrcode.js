// 담당 E: 사전 등록/체크인용 QR 코드 생성
// 오픈소스 라이브러리(예: qrcode.js, qrcode npm 패키지)를 사용해 구현합니다.

/**
 * 사용자 ID 기반으로 QR 코드를 화면에 렌더링합니다.
 * @param {HTMLElement} targetElement
 * @param {string|number} userId
 */
function generateEntranceQRCode(targetElement, userId) {
  // TODO: userId를 인코딩하여 targetElement 안에 QR 이미지 렌더링
  // 예) new QRCode(targetElement, `checkin:${userId}`)
}

export { generateEntranceQRCode };
