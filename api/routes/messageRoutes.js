const express = require('express');
const { 
  sendMessage,
  getConversations,
  getConversation,
  deleteMessage
} = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.post('/send', sendMessage);
router.get('/conversations', getConversations);
router.get('/conversation/:otherUserId', getConversation);
router.delete('/delete/:messageId', deleteMessage);

module.exports = router;