const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const webpush = require('web-push');

// Configure web-push with VAPID keys only if valid keys are provided
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

const isValidVapidKey = (key) => {
    // VAPID keys should be base64 encoded and 65 bytes when decoded
    if (!key || key === 'your_vapid_public_key' || key === '') {
        return false;
    }
    try {
        const decoded = Buffer.from(key, 'base64');
        return decoded.length === 65;
    } catch {
        return false;
    }
};

if (isValidVapidKey(vapidPublicKey) && vapidPrivateKey && vapidPrivateKey !== 'your_vapid_private_key') {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:example@example.com',
        vapidPublicKey,
        vapidPrivateKey
    );
}

// @desc    Subscribe to push notifications
// @route   POST /api/notifications/subscribe
// @access  Private
const subscribeToPush = asyncHandler(async (req, res) => {
    const subscription = req.body;

    if (!subscription) {
        res.status(400);
        throw new Error('Subscription data is required');
    }

    // Check if VAPID keys are configured
    if (!isValidVapidKey(vapidPublicKey)) {
        res.status(503);
        throw new Error('Push notifications not configured on server');
    }

    // Check if subscription already exists
    const user = await User.findById(req.user._id);
    const exists = user.pushSubscriptions.some(
        sub => sub.endpoint === subscription.endpoint
    );

    if (!exists) {
        user.pushSubscriptions.push(subscription);
        await user.save();
    }

    res.status(201).json({
        message: 'Subscribed to push notifications',
        publicKey: vapidPublicKey
    });
});

// @desc    Unsubscribe from push notifications
// @route   POST /api/notifications/unsubscribe
// @access  Private
const unsubscribeFromPush = asyncHandler(async (req, res) => {
    const { endpoint } = req.body;

    if (!endpoint) {
        res.status(400);
        throw new Error('Endpoint is required');
    }

    const user = await User.findById(req.user._id);
    user.pushSubscriptions = user.pushSubscriptions.filter(
        sub => sub.endpoint !== endpoint
    );
    await user.save();

    res.json({ message: 'Unsubscribed from push notifications' });
});

// @desc    Send test notification
// @route   POST /api/notifications/test
// @access  Private
const sendTestNotification = asyncHandler(async (req, res) => {
    // Check if VAPID keys are configured
    if (!isValidVapidKey(vapidPublicKey)) {
        res.status(503);
        throw new Error('Push notifications not configured on server');
    }

    const user = await User.findById(req.user._id);

    if (user.pushSubscriptions.length === 0) {
        res.status(400);
        throw new Error('No push subscriptions found');
    }

    const payload = JSON.stringify({
        title: 'Smart Reminder',
        body: 'This is a test notification!',
        icon: '/icons/icon-192.svg',
        badge: '/icons/badge-72.svg',
    });

    const notifications = await Promise.allSettled(
        user.pushSubscriptions.map(sub =>
            webpush.sendNotification(sub, payload)
        )
    );

    const failed = notifications.filter(n => n.status === 'rejected');
    if (failed.length > 0) {
        console.error('Failed notifications:', failed);
    }

    res.json({
        message: 'Test notification sent',
        success: notifications.length - failed.length,
        failed: failed.length
    });
});

// @desc    Send reminder notification (called by scheduler)
// @access  Private (internal)
const sendReminderNotification = asyncHandler(async (userId, task, time) => {
    // Check if VAPID keys are configured
    if (!isValidVapidKey(vapidPublicKey)) {
        return { success: false, message: 'Push not configured' };
    }

    const user = await User.findById(userId);

    if (!user || user.pushSubscriptions.length === 0) {
        return { success: false, message: 'No subscriptions' };
    }

    const payload = JSON.stringify({
        title: task.title || task.name,
        body: task.description || `Time for your ${task.type?.toLowerCase() || 'reminder'}!`,
        icon: '/icons/icon-192.svg',
        badge: '/icons/badge-72.svg',
        tag: task._id?.toString() || task.id?.toString(),
        data: {
            taskId: task._id || task.id,
            type: task.type,
            time,
        },
        actions: [
            { action: 'complete', title: 'Mark Done' },
            { action: 'snooze', title: 'Snooze 10min' },
        ],
    });

    const results = await Promise.allSettled(
        user.pushSubscriptions.map(sub =>
            webpush.sendNotification(sub, payload)
        )
    );

    const failed = results.filter(r => r.status === 'rejected');

    // Remove failed subscriptions
    if (failed.length > 0) {
        const failedEndpoints = [];
        results.forEach((r, i) => {
            if (r.status === 'rejected' && user.pushSubscriptions[i]) {
                failedEndpoints.push(user.pushSubscriptions[i].endpoint);
            }
        });

        user.pushSubscriptions = user.pushSubscriptions.filter(
            sub => !failedEndpoints.includes(sub.endpoint)
        );
        await user.save();
    }

    return {
        success: results.length - failed.length,
        failed: failed.length,
    };
});

module.exports = {
    subscribeToPush,
    unsubscribeFromPush,
    sendTestNotification,
    sendReminderNotification,
};
