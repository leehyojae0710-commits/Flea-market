// 담당 D: 댓글 (공고/판매자 페이지 공용)
const express = require('express');
const router = express.Router();
const commentController = require('../controllers/comment.controller');

router.post('/', commentController.createComment);
router.get('/', commentController.getCommentList); // ?targetType=&targetId=

module.exports = router;
