const cron = require('node-cron');
const webpush = require('web-push');
const Task = require('../models/Task');
const User = require('../models/User');

// Helper function to calculate time X minutes before
const getTimeBefore = (timeStr, minutes) => {
    const [hours, mins] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, mins - minutes, 0, 0);
    // If time went to previous day, return null (skip)
    if (date.getDate() < new Date().getDate()) {
        return null;
    }
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const sendNotification = async (task, user, isPreReminder = false) => {
    if (!user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
        return;
    }

    const reminderMinutes = task.reminderBefore || 5;
    const payload = JSON.stringify({
        title: isPreReminder
            ? `Upcoming: ${task.name || task.title}`
            : `Reminder: ${task.name || task.title}`,
        body: isPreReminder
            ? `Your task is due in ${reminderMinutes} minutes!`
            : (task.description || `It's time for your ${task.type}`),
        icon: '/icons/icon-192.svg',
        badge: '/icons/badge-72.svg',
        tag: task._id?.toString(),
        data: {
            url: `/dashboard`,
            taskId: task._id,
            type: task.type,
            isPreReminder
        },
        actions: [
            { action: 'complete', title: 'Mark Done' },
            { action: 'snooze', title: 'Snooze 10min' },
        ],
    });

    user.pushSubscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => console.error('Push Error', err));
    });
};

const checkReminders = () => {
    cron.schedule('* * * * *', async () => {
        console.log('Running Reminder Check Job...');

        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0');
        const currentMinutes = now.getMinutes().toString().padStart(2, '0');
        const currentTimeIndex = `${currentHours}:${currentMinutes}`;

        try {
            // Find all active tasks
            const allTasks = await Task.find({
                status: 'Active',
            }).populate('user');

            for (const task of allTasks) {
                if (!task.times || !task.user) continue;

                const user = task.user;
                const reminderMinutes = task.reminderBefore || 5;

                // Check each scheduled time for this task
                for (const taskTime of task.times) {
                    // 1. Check for pre-reminder (X minutes before)
                    const preReminderTime = getTimeBefore(taskTime, reminderMinutes);
                    if (preReminderTime && preReminderTime === currentTimeIndex) {
                        console.log(`Sending pre-reminder for task: ${task.name || task.title} at ${currentTimeIndex}`);
                        await sendNotification(task, user, true);
                    }

                    // 2. Check for exact time reminder
                    if (taskTime === currentTimeIndex) {
                        console.log(`Sending exact reminder for task: ${task.name || task.title} at ${currentTimeIndex}`);
                        await sendNotification(task, user, false);
                    }
                }
            }
        } catch (error) {
            console.error('Error in cron job:', error);
        }
    });
};

module.exports = checkReminders;
