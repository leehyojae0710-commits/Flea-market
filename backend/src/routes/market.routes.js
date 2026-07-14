// 마켓(공고) 라우트 - 조회는 담당 C, 등록/신청목록은 담당 D, 좌표 저장은 담당 E
const express = require('express');
const router = express.Router();
const marketController = require('../controllers/market.controller');

router.get('/', marketController.getMarketList);               // 담당 C
router.get('/:marketId', marketController.getMarketDetail);     // 담당 C
router.post('/', marketController.createMarket);                // 담당 D
router.get('/:marketId/applications', marketController.getApplicationsByMarket); // 담당 D
router.patch('/:marketId/location', marketController.updateMarketLocation);      // 담당 E

module.exports = router;
