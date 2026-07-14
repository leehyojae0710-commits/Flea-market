// 담당 C: 회원/인증 라우트
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.post('/logout', authController.logoutUser);
router.patch('/toggle-role', authController.toggleUserRole);

// /api/users/me 로도 연결됨 (app.js 참고)
router.patch('/me', authController.updateUserProfile);
router.delete('/me', authController.deleteUserAccount);

module.exports = router;
