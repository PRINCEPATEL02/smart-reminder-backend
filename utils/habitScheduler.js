const { calculateNotificationTime } = require('./smartScheduler');

const RECURRING_TYPES = new Set(['daily', 'weekly', 'monthly']);

const isHabit = (reminder) => Boolean(reminder?.isHabit && RECURRING_TYPES.has(reminder?.recurrence));

const addRecurringPeriod = (date, recurrence) => {
  const next = new Date(date);

  if (recurrence === 'daily') {
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (recurrence === 'weekly') {
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (recurrence === 'monthly') {
    const day = next.getDate();
    next.setMonth(next.getMonth() + 1);
    if (next.getDate() < day) {
      next.setDate(0);
    }
    return next;
  }

  return next;
};

const getPeriodEnd = (date, recurrence) => {
  const next = addRecurringPeriod(date, recurrence);
  return new Date(next.getTime() - 1);
};

const getPeriodKey = (date, recurrence) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  if (recurrence === 'daily') {
    return `${year}-${month}-${day}`;
  }

  if (recurrence === 'monthly') {
    return `${year}-${month}`;
  }

  const weekStart = new Date(date);
  const weekday = weekStart.getDay();
  const diffToMonday = (weekday + 6) % 7;
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - diffToMonday);

  const startYear = weekStart.getFullYear();
  const startMonth = `${weekStart.getMonth() + 1}`.padStart(2, '0');
  const startDay = `${weekStart.getDate()}`.padStart(2, '0');
  return `${startYear}-${startMonth}-${startDay}`;
};

const rollHabitForward = (reminder, now = new Date(), advanceMinutes = 15) => {
  if (!isHabit(reminder)) return false;

  let changed = false;

  while (reminder.dueDate && getPeriodEnd(reminder.dueDate, reminder.recurrence) < now) {
    if (reminder.status !== 'completed') {
      reminder.streakCurrent = 0;
      reminder.missedAt = reminder.missedAt || new Date();
    }

    reminder.dueDate = addRecurringPeriod(reminder.dueDate, reminder.recurrence);
    reminder.status = 'pending';
    reminder.completedAt = undefined;
    reminder.notificationSent = false;
    reminder.notificationTime = calculateNotificationTime(reminder.dueDate, advanceMinutes);
    changed = true;
  }

  return changed;
};

const completeHabit = (reminder, completedAt = new Date()) => {
  if (!isHabit(reminder)) return;

  const currentKey = getPeriodKey(reminder.dueDate, reminder.recurrence);

  if (reminder.lastCompletedPeriodKey === currentKey) {
    return;
  }

  const expectedPrevDate = new Date(reminder.dueDate);
  if (reminder.recurrence === 'daily') expectedPrevDate.setDate(expectedPrevDate.getDate() - 1);
  if (reminder.recurrence === 'weekly') expectedPrevDate.setDate(expectedPrevDate.getDate() - 7);
  if (reminder.recurrence === 'monthly') expectedPrevDate.setMonth(expectedPrevDate.getMonth() - 1);
  const expectedPrevKey = getPeriodKey(expectedPrevDate, reminder.recurrence);

  reminder.streakCurrent =
    reminder.lastCompletedPeriodKey === expectedPrevKey
      ? (reminder.streakCurrent || 0) + 1
      : 1;

  reminder.streakBest = Math.max(reminder.streakBest || 0, reminder.streakCurrent);
  reminder.lastCompletedPeriodKey = currentKey;
  reminder.lastCompletedAt = completedAt;
  reminder.status = 'completed';
  reminder.completedAt = completedAt;
};

const normalizeHabitReminders = async (reminders, advanceMinutes = 15) => {
  let changedCount = 0;

  for (const reminder of reminders) {
    if (rollHabitForward(reminder, new Date(), advanceMinutes)) {
      await reminder.save();
      changedCount += 1;
    }
  }

  return changedCount;
};

module.exports = {
  isHabit,
  getPeriodKey,
  rollHabitForward,
  completeHabit,
  normalizeHabitReminders,
};
