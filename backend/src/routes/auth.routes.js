const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 1. 회원가입: POST /api/auth/register
router.post('/register', authController.registerUser);

// 2. 로그인: POST /api/auth/login
router.post('/login', authController.loginUser);

// 3. 로그아웃: POST /api/auth/logout
router.post('/logout', authController.logoutUser);

// 4. 역할 전환 (판매자 <-> 주최자): POST /api/auth/toggle-role
router.post('/toggle-role', authController.toggleUserRole);

// 5. 회원 정보 수정: PUT /api/auth/profile
router.put('/profile', authController.updateUserProfile);

// 6. 회원 탈퇴: DELETE /api/auth/account
router.delete('/account', authController.deleteUserAccount);

module.exports = router;