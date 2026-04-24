const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Reminder = require('../models/Reminder');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const {
  suggestReminderTimes,
  autoReschedule,
  calculateNotificationTime,
} = require('../utils/smartScheduler');
const {
  isHabit,
  rollHabitForward,
  completeHabit,
  normalizeHabitReminders,
} = require('../utils/habitScheduler');

// All routes require authentication
router.use(protect);

const syncUserHabits = async (user) => {
  const habits = await Reminder.find({
    user: user._id,
    isHabit: true,
    recurrence: { $in: ['daily', 'weekly', 'monthly'] },
  });

  const advanceMinutes = user.notificationPreferences?.advanceMinutes || 15;
  await normalizeHabitReminders(habits, advanceMinutes);
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const updateDailyHabitStreak = async (userId, date = new Date()) => {
  const user = await User.findById(userId);
  if (!user) return null;

  const dateKey = formatDateKey(date);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const dailyHabits = await Reminder.find({
    user: userId,
    isHabit: true,
    recurrence: 'daily',
    dueDate: { $gte: start, $lte: end },
  }).select('status');

  if (!dailyHabits.length) {
    return user;
  }

  const yesterdayKey = formatDateKey(addDays(date, -1));
  const lastCompletedKey = user.habitData?.lastCompletedHabitDate;

  if (lastCompletedKey && lastCompletedKey !== dateKey && lastCompletedKey !== yesterdayKey) {
    user.habitData.currentDailyStreak = 0;
  }

  const allCompleted = dailyHabits.every((habit) => habit.status === 'completed');

  if (allCompleted && lastCompletedKey !== dateKey) {
    user.habitData.currentDailyStreak =
      lastCompletedKey === yesterdayKey
        ? (user.habitData.currentDailyStreak || 0) + 1
        : 1;
    user.habitData.bestDailyStreak = Math.max(
      user.habitData.bestDailyStreak || 0,
      user.habitData.currentDailyStreak
    );
    user.habitData.lastCompletedHabitDate = dateKey;
  }

  await user.save({ validateBeforeSave: false });
  return user;
};

// ─── GET /api/reminders ───────────────────────────────────────────────────────
// Supports: pagination, filtering by status/priority/category, date range
router.get('/', async (req, res) => {
  try {
    await syncUserHabits(req.user);
    await updateDailyHabitStreak(req.user._id);

    const {
      page = 1,
      limit = 20,
      status,
      priority,
      category,
      startDate,
      endDate,
      search,
      sort = '-createdAt',
    } = req.query;

    const filter = { user: req.user._id };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (startDate || endDate) {
      filter.dueDate = {};
      if (startDate) filter.dueDate.$gte = new Date(startDate);
      if (endDate) filter.dueDate.$lte = new Date(endDate);
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [reminders, total] = await Promise.all([
      Reminder.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean({ virtuals: true }),
      Reminder.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: reminders,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reminders' });
  }
});

// ─── GET /api/reminders/today ─────────────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    await syncUserHabits(req.user);
    await updateDailyHabitStreak(req.user._id);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const reminders = await Reminder.find({
      user: req.user._id,
      dueDate: { $gte: start, $lte: end },
    }).sort('dueDate').lean({ virtuals: true });

    res.json({ success: true, data: reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch today reminders' });
  }
});

// ─── GET /api/reminders/upcoming ─────────────────────────────────────────────
router.get('/upcoming', async (req, res) => {
  try {
    await syncUserHabits(req.user);
    await updateDailyHabitStreak(req.user._id);

    const { days = 7 } = req.query;
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + parseInt(days));

    const reminders = await Reminder.find({
      user: req.user._id,
      dueDate: { $gte: start, $lte: end },
      status: 'pending',
    }).sort('dueDate').limit(50).lean({ virtuals: true });

    res.json({ success: true, data: reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch upcoming reminders' });
  }
});

// ─── GET /api/reminders/smart-suggestions ────────────────────────────────────
router.get('/smart-suggestions', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const suggestions = suggestReminderTimes(user, 3);
    res.json({ success: true, data: suggestions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get suggestions' });
  }
});

// ─── GET /api/reminders/missed ────────────────────────────────────────────────
router.get('/missed', async (req, res) => {
  try {
    await syncUserHabits(req.user);
    await updateDailyHabitStreak(req.user._id);

    const reminders = await Reminder.find({
      user: req.user._id,
      status: { $in: ['pending', 'missed'] },
      dueDate: { $lt: new Date() },
    }).sort('-dueDate').lean({ virtuals: true });

    res.json({ success: true, data: reminders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch missed reminders' });
  }
});

// ─── GET /api/reminders/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    await syncUserHabits(req.user);
    await updateDailyHabitStreak(req.user._id);

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).lean({ virtuals: true });

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    res.json({ success: true, data: reminder });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch reminder' });
  }
});

// ─── POST /api/reminders ──────────────────────────────────────────────────────
const createValidation = [
  body('title').trim().notEmpty().withMessage('Title required').isLength({ max: 100 }),
  body('dueDate').isISO8601().withMessage('Valid date required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('category').optional().isIn(['work', 'personal', 'health', 'finance', 'education', 'other']),
  body('recurrence').optional().isIn(['none', 'daily', 'weekly', 'monthly']),
  body('isHabit').optional().isBoolean(),
];

router.post('/', createValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const {
      title, description, dueDate, priority, category,
      tags, recurrence, advanceMinutes, isHabit: habitFlag,
    } = req.body;

    const notifMinutes = advanceMinutes || req.user.notificationPreferences?.advanceMinutes || 15;
    const parsedDue = new Date(dueDate);
    const isHabitReminder = Boolean(habitFlag);
    const normalizedRecurrence = isHabitReminder ? (recurrence || 'daily') : (recurrence || 'none');

    if (isHabitReminder && normalizedRecurrence === 'none') {
      return res.status(400).json({ success: false, message: 'Habits must repeat daily, weekly, or monthly' });
    }

    const reminder = await Reminder.create({
      user: req.user._id,
      title,
      description,
      dueDate: parsedDue,
      priority: priority || 'medium',
      category: category || 'other',
      tags: tags || [],
      isHabit: isHabitReminder,
      recurrence: normalizedRecurrence,
      notificationTime: calculateNotificationTime(parsedDue, notifMinutes),
    });

    // Update user behavior data
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 'behaviorData.totalCreated': 1 },
      'behaviorData.lastActive': new Date(),
    });

    // Emit real-time event via Socket.IO (attached to app)
    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('reminder:created', reminder);
    }

    res.status(201).json({ success: true, data: reminder });
  } catch (error) {
    console.error('Create reminder error:', error);
    res.status(500).json({ success: false, message: 'Failed to create reminder' });
  }
});

// ─── PUT /api/reminders/:id ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    const allowedUpdates = [
      'title', 'description', 'dueDate', 'priority',
      'category', 'status', 'tags', 'recurrence', 'isHabit',
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        reminder[field] = req.body[field];
      }
    });

    if (reminder.isHabit && reminder.recurrence === 'none') {
      reminder.recurrence = 'daily';
    }

    const notifMinutes = req.user.notificationPreferences?.advanceMinutes || 15;
    rollHabitForward(reminder, new Date(), notifMinutes);

    // If marking as completed
    if (req.body.status === 'completed' && reminder.isHabit) {
      const alreadyCompletedThisPeriod =
        reminder.completedAt &&
        reminder.status === 'completed';

      completeHabit(reminder, new Date());

      if (!alreadyCompletedThisPeriod) {
        const user = await User.findById(req.user._id);
        user.updateBehavior(new Date(reminder.dueDate).getHours(), true);
        await user.save({ validateBeforeSave: false });
      }
      await updateDailyHabitStreak(req.user._id, reminder.dueDate);
    } else if (req.body.status === 'completed' && !reminder.completedAt) {
      reminder.completedAt = new Date();
      const user = await User.findById(req.user._id);
      user.updateBehavior(new Date().getHours(), true);
      await user.save({ validateBeforeSave: false });
    }

    // If marking as missed
    if (req.body.status === 'missed' && !reminder.missedAt) {
      reminder.missedAt = new Date();
      const user = await User.findById(req.user._id);
      user.updateBehavior(new Date().getHours(), false);
      await user.save({ validateBeforeSave: false });
    }

    // Update notification time if due date changed
    if (req.body.dueDate) {
      reminder.notificationTime = calculateNotificationTime(new Date(req.body.dueDate), notifMinutes);
      reminder.notificationSent = false;
    }

    await reminder.save();

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('reminder:updated', reminder);
    }

    res.json({ success: true, data: reminder });
  } catch (error) {
    console.error('Update reminder error:', error);
    res.status(500).json({ success: false, message: 'Failed to update reminder' });
  }
});

// ─── DELETE /api/reminders/:id ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const reminder = await Reminder.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('reminder:deleted', { id: req.params.id });
    }

    res.json({ success: true, message: 'Reminder deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete reminder' });
  }
});

// ─── POST /api/reminders/:id/reschedule ──────────────────────────────────────
router.post('/:id/reschedule', async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    const user = await User.findById(req.user._id);
    const newDate = req.body.newDate
      ? new Date(req.body.newDate)
      : autoReschedule(reminder, user);

    if (!reminder.originalDueDate) {
      reminder.originalDueDate = reminder.dueDate;
    }
    reminder.dueDate = newDate;
    reminder.status = 'pending';
    reminder.rescheduleCount += 1;
    reminder.notificationTime = calculateNotificationTime(newDate, 15);

    await reminder.save();

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('reminder:updated', reminder);
    }

    res.json({ success: true, data: reminder });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to reschedule' });
  }
});

// ─── POST /api/reminders/:id/snooze ──────────────────────────────────────────
router.post('/:id/snooze', async (req, res) => {
  try {
    const { minutes = 30 } = req.body;
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Reminder not found' });
    }

    const newDue = new Date(Date.now() + minutes * 60 * 1000);
    reminder.dueDate = newDue;
    reminder.status = 'snoozed';
    reminder.snoozeCount += 1;
    reminder.notificationTime = calculateNotificationTime(newDue, 5);
    await reminder.save();

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('reminder:updated', reminder);
    }

    res.json({ success: true, data: reminder });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to snooze reminder' });
  }
});

module.exports = router;
