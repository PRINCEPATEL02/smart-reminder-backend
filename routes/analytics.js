const express = require('express');
const router = express.Router();
const Reminder = require('../models/Reminder');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { generateAnalytics } = require('../utils/smartScheduler');

router.use(protect);

// @route   GET /api/analytics/summary
// @desc    Get analytics summary
// @access  Private
router.get('/summary', async (req, res) => {
  try {
    const { range = '30' } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(range));

    const reminders = await Reminder.find({
      user: req.user._id,
      createdAt: { $gte: startDate },
    });

    const analytics = generateAnalytics(reminders);

    // Fetch user behavior data
    const user = await User.findById(req.user._id);
    analytics.preferredHours = user.behaviorData.preferredHours;
    analytics.avgCompletionRate = user.behaviorData.avgCompletionRate;
    analytics.dailyHabitStreak = user.habitData?.currentDailyStreak || 0;
    analytics.bestDailyHabitStreak = user.habitData?.bestDailyStreak || 0;

    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
});

// @route   GET /api/analytics/heatmap
// @desc    Get activity heatmap data (last 90 days)
// @access  Private
router.get('/heatmap', async (req, res) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const reminders = await Reminder.find({
      user: req.user._id,
      createdAt: { $gte: startDate },
    }).select('createdAt status dueDate').lean();

    const heatmap = {};
    reminders.forEach((r) => {
      const day = r.createdAt.toISOString().split('T')[0];
      if (!heatmap[day]) heatmap[day] = { total: 0, completed: 0 };
      heatmap[day].total += 1;
      if (r.status === 'completed') heatmap[day].completed += 1;
    });

    res.json({ success: true, data: heatmap });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch heatmap' });
  }
});

module.exports = router;
