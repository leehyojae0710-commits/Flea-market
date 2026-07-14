// 담당 D: 내 일정(주최/참가) 조회
const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/schedule.controller');

router.get('/me', scheduleController.getMySchedule);

module.exports = router;
