// 담당 C: 회원/인증 비즈니스 로직
// 함수명은 docs/naming-convention.md 규칙을 따릅니다.

const db = require('../config/db'); // MySQL 연결 설정 임포트
const bcrypt = require('bcrypt');   // 비밀번호 암호화 라이브러리
const jwt = require('jsonwebtoken'); // JWT 토큰 발행 라이브러리

const JWT_SECRET = process.env.JWT_SECRET || 'flea_market_secret_key_1234'; // JWT 비밀키 (기본값 설정)

/**
 * 1. 회원가입 (registerUser)
 * email/password/phone/region 검증 후 bcrypt 해시, users 테이블 저장
 */
const registerUser = async (req, res) => {
  const { email, password, phone, region, userId, userType } = req.body;

  try {
    // 1) 필수 데이터 검증
    if (!email || !password || !userId) {
      return res.status(400).json({ 
        success: false, 
        data: null, 
        message: '이메일, 비밀번호, 아이디는 필수 입력 항목입니다.' 
      });
    }

    // 2) 비밀번호 bcrypt 단방향 해시 암호화 (솔트 라운드: 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3) DB 저장 쿼리 실행
    // 기본 활성화 역할(active_role)은 가입한 userType에 맞춰 설정 (0: seller, 1: host)
    const defaultRole = Number(userType) === 1 ? 'host' : 'seller';

    const query = `
      INSERT INTO users (userId, email, password, phone, region, userType, active_role) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(query, [userId, email, hashedPassword, phone, region, userType || 0, defaultRole], (err, result) => {
      if (err) {
        console.error('회원가입 DB 저장 에러:', err);
        // 아이디 중복 혹은 이메일 중복 시 에러 처리
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ 
            success: false, 
            data: null, 
            message: '이미 존재하는 아이디 또는 이메일입니다.' 
          });
        }
        return res.status(500).json({ 
          success: false, 
          data: null, 
          message: '서버 DB 등록 오류가 발생했습니다.' 
        });
      }

      return res.status(201).json({
        success: true,
        data: { userId, email },
        message: '회원가입이 완료되었습니다.'
      });
    });

  } catch (error) {
    console.error('회원가입 처리 중 예외 에러:', error);
    res.status(500).json({ success: false, data: null, message: '서버 에러가 발생했습니다.' });
  }
};

/**
 * 2. 로그인 (loginUser)
 * 이메일(또는 아이디) 및 비밀번호 확인 후 JWT 발급
 */
const loginUser = async (req, res) => {
  const { userId, password } = req.body;

  try {
    // 1) 필수 입력값 검증
    if (!userId || !password) {
      return res.status(400).json({ 
        success: false, 
        data: null, 
        message: '아이디와 비밀번호를 입력해주세요.' 
      });
    }

    // 2) DB에서 유저 존재 여부 확인
    const query = 'SELECT * FROM users WHERE userId = ?';
    db.query(query, [userId], async (err, results) => {
      if (err) {
        console.error('로그인 DB 조회 에러:', err);
        return res.status(500).json({ 
          success: false, 
          data: null, 
          message: '서버 에러가 발생했습니다.' 
        });
      }

      if (results.length === 0) {
        return res.status(401).json({ 
          success: false, 
          data: null, 
          message: '존재하지 않는 사용자 아이디입니다.' 
        });
      }

      const user = results[0];

      // 3) bcrypt 비밀번호 대조
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ 
          success: false, 
          data: null, 
          message: '비밀번호가 일치하지 않습니다.' 
        });
      }

      // 4) 로그인 성공 시 JWT 토큰 생성 (유효기간: 24시간)
      const token = jwt.sign(
        { userId: user.userId, email: user.email, activeRole: user.active_role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.status(200).json({
        success: true,
        data: {
          token,
          user: {
            userId: user.userId,
            email: user.email,
            activeRole: user.active_role
          }
        },
        message: '로그인에 성공했습니다!'
      });
    });

  } catch (error) {
    console.error('로그인 처리 중 예외 에러:', error);
    res.status(500).json({ success: false, data: null, message: '서버 에러가 발생했습니다.' });
  }
};

/**
 * 3. 로그아웃 (logoutUser)
 * 세션/토큰 무효화 안내
 */
const logoutUser = async (req, res) => {
  // JWT 기반 로그아웃은 프론트엔드(클라이언트)가 보관 중인 토큰을 삭제함으로써 구현합니다.
  res.status(200).json({ 
    success: true, 
    data: null, 
    message: '로그아웃 성공. 브라우저의 저장된 토큰(localStorage 등)을 삭제해 주세요.' 
  });
};

/**
 * 4. 역할 전환 (toggleUserRole)
 * users.active_role 을 host <-> seller 로 전환
 */
const toggleUserRole = async (req, res) => {
  const { userId, currentRole } = req.body;

  try {
    if (!userId || !currentRole) {
      return res.status(400).json({ 
        success: false, 
        data: null, 
        message: '사용자 아이디와 현재 역할 정보가 필요합니다.' 
      });
    }

    // 역할 스위칭 (host <-> seller)
    const newRole = currentRole === 'host' ? 'seller' : 'host';

    const query = 'UPDATE users SET active_role = ? WHERE userId = ?';
    db.query(query, [newRole, userId], (err, result) => {
      if (err) {
        console.error('역할 전환 DB 에러:', err);
        return res.status(500).json({ 
          success: false, 
          data: null, 
          message: '역할을 전환하는 도중 DB 오류가 발생했습니다.' 
        });
      }

      return res.status(200).json({
        success: true,
        data: { activeRole: newRole },
        message: `역할이 성공적으로 ${newRole === 'host' ? '주최자' : '판매자'}로 전환되었습니다.`
      });
    });

  } catch (error) {
    console.error('역할 전환 중 예외 에러:', error);
    res.status(500).json({ success: false, data: null, message: '서버 에러가 발생했습니다.' });
  }
};

/**
 * 5. 회원 정보 수정 (updateUserProfile)
 * 비밀번호/주소(region)/전화번호(phone) 수정
 */
const updateUserProfile = async (req, res) => {
  const { userId, password, region, phone } = req.body;

  try {
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        data: null, 
        message: '사용자 ID가 필요합니다.' 
      });
    }

    let updateFields = [];
    let queryParams = [];

    // 비밀번호가 들어온 경우 해시 암호화 처리 후 쿼리에 추가
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password = ?');
      queryParams.push(hashedPassword);
    }

    if (region) {
      updateFields.push('region = ?');
      queryParams.push(region);
    }

    if (phone) {
      updateFields.push('phone = ?');
      queryParams.push(phone);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        data: null, 
        message: '수정할 정보가 제공되지 않았습니다.' 
      });
    }

    queryParams.push(userId);
    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE userId = ?`;

    db.query(query, queryParams, (err, result) => {
      if (err) {
        console.error('회원 정보 수정 DB 에러:', err);
        return res.status(500).json({ 
          success: false, 
          data: null, 
          message: '정보 수정 중 DB 오류가 발생했습니다.' 
        });
      }

      return res.status(200).json({
        success: true,
        data: null,
        message: '회원 정보가 성공적으로 수정되었습니다.'
      });
    });

  } catch (error) {
    console.error('회원 정보 수정 중 예외 에러:', error);
    res.status(500).json({ success: false, data: null, message: '서버 에러가 발생했습니다.' });
  }
};

/**
 * 6. 회원 탈퇴 (deleteUserAccount)
 * 회원 탈퇴 처리 (데이터 삭제)
 */
const deleteUserAccount = async (req, res) => {
  const { userId } = req.body;

  try {
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        data: null, 
        message: '사용자 ID가 누락되었습니다.' 
      });
    }

    const query = 'DELETE FROM users WHERE userId = ?';
    db.query(query, [userId], (err, result) => {
      if (err) {
        console.error('회원 탈퇴 DB 에러:', err);
        return res.status(500).json({ 
          success: false, 
          data: null, 
          message: '회원 탈퇴 처리 중 DB 오류가 발생했습니다.' 
        });
      }

      return res.status(200).json({
        success: true,
        data: null,
        message: '회원 탈퇴 및 계정 정보 삭제가 완료되었습니다.'
      });
    });

  } catch (error) {
    console.error('회원 탈퇴 중 예외 에러:', error);
    res.status(500).json({ success: false, data: null, message: '서버 에러가 발생했습니다.' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  toggleUserRole,
  updateUserProfile,
  deleteUserAccount,
};