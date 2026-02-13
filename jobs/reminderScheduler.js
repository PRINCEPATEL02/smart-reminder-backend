const cron = require('node-cron');
const webpush = require('web-push');
const Task = require('../models/Task');
const User = require('../models/User');

const checkReminders = () => {
    cron.schedule('* * * * *', async () => {
        console.log('Running Reminder Check Job...');

        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0');
        const currentMinutes = now.getMinutes().toString().padStart(2, '0');
        const currentTimeIndex = `${currentHours}:${currentMinutes}`;

        try {
            // Find tasks needed to be triggered at this time
            // Note: This matches SERVER TIME. For production support of multiple timezones,
            // we would need to calculate the current time for each timezone and query accordingly.
            const tasks = await Task.find({
                status: 'Active',
                times: { $in: [currentTimeIndex] },
            }).populate('user');

            for (const task of tasks) {
                // Send Notification
                const user = task.user;
                if (user && user.pushSubscriptions && user.pushSubscriptions.length > 0) {
                    const payload = JSON.stringify({
                        title: `Reminder: ${task.name}`,
                        body: task.description || `It's time for your ${task.type}`,
                        icon: '/icon.png', // path to PWA icon
                        data: { url: `/dashboard` }
                    });

                    user.pushSubscriptions.forEach(sub => {
                        webpush.sendNotification(sub, payload).catch(err => console.error('Push Error', err));
                    });
                }
            }
        } catch (error) {
            console.error('Error in cron job:', error);
        }
    });
};

module.exports = checkReminders;
