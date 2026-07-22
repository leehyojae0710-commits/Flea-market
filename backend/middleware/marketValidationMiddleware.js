// backend/middleware/marketValidationMiddleware.js
// [담당 D 신규] 마켓(행사) 등록값 유효성 검사 미들웨어
// - createMarket 컨트롤러 앞단에서 req.body 를 검사합니다.
// - 기존 createMarket 안의 "필수값 존재 여부"만 보던 체크와 별개로,
//   형식/범위까지 한 단계 더 검사합니다.
// - 신규 파일이라 기존 marketController.js 는 건드리지 않습니다.

export function validateMarketInput(req, res, next) {
  const {
    title,
    description,
    locationName,
    latitude,
    longitude,
    eventDate_min,
    eventDate_max,
    boothPrice,
    maxparticipants,
  } = req.body;

  const errors = [];

  // 1) 마켓 이름
  if (!title || String(title).trim().length === 0) {
    errors.push('마켓 이름을 입력해주세요.');
  } else if (String(title).length > 100) {
    errors.push('마켓 이름은 100자를 초과할 수 없습니다.');
  }

  // 2) 장소
  if (!locationName || String(locationName).trim().length === 0) {
    errors.push('장소를 입력해주세요.');
  }

  // 3) 개최 일자 (형식 + 논리 검증)
  if (!eventDate_min || !eventDate_max) {
    errors.push('개최 시작일과 종료일을 입력해주세요.');
  } else {
    const start = new Date(eventDate_min);
    const end = new Date(eventDate_max);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      errors.push('개최 일자 형식이 올바르지 않습니다. (예: 2026-08-01)');
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start < today) {
        errors.push('개최 시작일은 오늘 이후 날짜여야 합니다.');
      }
      if (end < start) {
        errors.push('개최 종료일은 시작일보다 빠를 수 없습니다.');
      }
    }
  }

  // 4) 좌표 범위 (값이 들어온 경우에만 검사)
  if (latitude !== undefined && latitude !== null && (latitude < -90 || latitude > 90)) {
    errors.push('위도(latitude) 값이 올바르지 않습니다.');
  }
  if (longitude !== undefined && longitude !== null && (longitude < -180 || longitude > 180)) {
    errors.push('경도(longitude) 값이 올바르지 않습니다.');
  }

  // 5) 부스 가격
  if (boothPrice !== undefined && boothPrice !== null) {
    if (Number.isNaN(Number(boothPrice)) || Number(boothPrice) < 0) {
      errors.push('부스 가격은 0 이상의 숫자여야 합니다.');
    }
  }

  // 6) 최대 참가 인원
  if (maxparticipants !== undefined && maxparticipants !== null) {
    if (Number.isNaN(Number(maxparticipants)) || Number(maxparticipants) < 1) {
      errors.push('최대 참가 인원은 1명 이상이어야 합니다.');
    }
  }

  // 7) 설명 길이
  if (description !== undefined && description !== null && String(description).length > 2000) {
    errors.push('설명은 2000자를 초과할 수 없습니다.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      data: null,
      message: errors[0],
      errors, // 프론트에서 필드별로 보여주고 싶을 때 사용 가능
    });
  }

  next();
}
