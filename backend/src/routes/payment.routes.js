// 담당 D: 모의 결제 (실제 PG 연동은 3주 일정상 제외)
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

router.post('/fake', paymentController.processFakePayment);

module.exports = router;
