export function calculateRefundRate(eventDateMin, requestDate = new Date()) {
  const eventDate = new Date(eventDateMin);
  const diffMs = eventDate - requestDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= 7) return 1.0;      // 7일 이상 전 -> 100% 환불
  if (diffDays >= 5) return 0.5;      // 5~6일 전 -> 50% 환불
  if (diffDays >= 3) return 0.3;      // 3~4일 전 -> 30% 환불
  return 0;                            // 3일 미만 -> 환불 불가
}



/*
 환불 정책 임의 적용
*/ 