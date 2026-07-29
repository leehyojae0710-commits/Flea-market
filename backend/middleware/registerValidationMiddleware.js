// backend/middleware/registerValidationMiddleware.js
// [신규] 회원가입(/auth/register) 입력값 형식 검증 미들웨어
// - authRoutes.js 안의 기존 "필수값 존재 여부"만 보던 체크와 별개로,
//   형식(정규식)까지 한 단계 더 검사합니다.
// - marketValidationMiddleware.js와 동일한 패턴(에러 배열 -> 400 응답)을 따릅니다.
// - 프론트(frontend/common/js/validators.js)의 정규식과 반드시 같은 규칙을 유지해주세요.
//   (프론트 검증은 우회 가능하므로, 서버 검증이 최종 방어선입니다.)

import { USER_TYPE } from './roleGuard.js';
// [수정] 닉네임 규칙은 utills/nicknamePolicy.js 로 옮겼습니다.
//        (회원가입 / 중복확인 API / 프로필 수정이 같은 규칙을 쓰도록 하기 위함)
import { validateNickname } from '../utills/nicknamePolicy.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 010-0000-0000 형식 (010~019, 하이픈 필수, 중간 3~4자리)
const PHONE_REGEX = /^01[0-9]-\d{3,4}-\d{4}$/;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

const REGION_MAX_LENGTH = 50;

export function validateRegisterInput(req, res, next) {
  const { userType, email, password, phone, region, nickname } = req.body;

  const errors = [];

  // 1) 가입 역할 (0: 판매자 / 1: 주최자)
  if (userType === undefined || userType === null || String(userType).trim() === '') {
    errors.push('가입 역할을 선택해주세요.');
  } else if (![USER_TYPE.SELLER, USER_TYPE.HOST].includes(Number(userType))) {
    errors.push('가입 역할 값이 올바르지 않습니다.');
  }

  // 2) 이메일
  if (!email || String(email).trim().length === 0) {
    errors.push('이메일을 입력해주세요.');
  } else if (!EMAIL_REGEX.test(String(email).trim())) {
    errors.push('이메일 형식이 올바르지 않습니다. (예: you@example.com)');
  }

  // 3) 비밀번호 (8자 이상 + 영문 소문자 1개 이상 + 특수문자 1개 이상)
  if (!password) {
    errors.push('비밀번호를 입력해주세요.');
  } else if (String(password).length < PASSWORD_MIN_LENGTH) {
    errors.push(`비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`);
  } else if (!PASSWORD_LOWERCASE_REGEX.test(String(password))) {
    errors.push('비밀번호에 영문 소문자를 1개 이상 포함해주세요.');
  } else if (!PASSWORD_SPECIAL_REGEX.test(String(password))) {
    errors.push('비밀번호에 특수문자를 1개 이상 포함해주세요. (예: ! @ # $ % 등)');
  }

  // 4) 전화번호
  if (!phone || String(phone).trim().length === 0) {
    errors.push('전화번호를 입력해주세요.');
  } else if (!PHONE_REGEX.test(String(phone).trim())) {
    errors.push('전화번호는 010-1234-5678 형식으로 입력해주세요.');
  }

  // 5) 거주 지역 (형식은 자유 텍스트라 길이만 제한)
  if (!region || String(region).trim().length === 0) {
    errors.push('거주 지역을 입력해주세요.');
  } else if (String(region).length > REGION_MAX_LENGTH) {
    errors.push(`거주 지역은 ${REGION_MAX_LENGTH}자를 초과할 수 없습니다.`);
  }

  // 6) 닉네임 (형식 + 예약어)
  const nicknameCheck = validateNickname(nickname);
  if (!nicknameCheck.ok) {
    errors.push(nicknameCheck.message);
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
