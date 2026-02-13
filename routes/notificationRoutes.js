const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    subscribeToPush,
    unsubscribeFromPush,
    sendTestNotification
} = require('../controllers/notificationController');

// All routes are protected
router.use(protect);

router.post('/subscribe', subscribeToPush);
router.post('/unsubscribe', unsubscribeFromPush);
router.post('/test', sendTestNotification);

module.exports = router;
