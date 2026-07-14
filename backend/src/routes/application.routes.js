// 담당 D: 부스 신청 / 승인 / 반려
const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/application.controller');

router.post('/', applicationController.applyForBooth);
router.patch('/:applicationId/approve', applicationController.approveSellerApplication);
router.patch('/:applicationId/reject', applicationController.rejectSellerApplication);

module.exports = router;
