const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect, authorize } = require('../middleware/auth');
const { getChatConversations, getChatUnreadCount, getChatMessages, sendChatMessage, markChatRead, getChatAttachment, deleteChatMessage } = require('../controllers/chatController');

const router = express.Router();
router.use(protect, authorize('admin', 'coach', 'receptionist', 'parent'));
const sendLimit = rateLimit({ windowMs: 60000, max: 60, keyGenerator: (req) => String(req.user._id), message: { message: 'Please wait a moment before sending more messages.' } });
router.get('/conversations', getChatConversations);
router.get('/unread-count', getChatUnreadCount);
router.get('/:parentUserId/messages', getChatMessages);
router.get('/:parentUserId/messages/:messageId/attachment', getChatAttachment);
router.post('/:parentUserId/messages', sendLimit, sendChatMessage);
router.delete('/:parentUserId/messages/:messageId', sendLimit, deleteChatMessage);
router.post('/:parentUserId/read', markChatRead);
module.exports = router;
