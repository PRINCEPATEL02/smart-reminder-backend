/**
 * SmartScheduler - AI-like logic for reminder suggestions and rescheduling
 */

/**
 * Suggest optimal reminder times based on user behavior
 * @param {Object} user - User document with behaviorData
 * @param {Number} count - Number of suggestions to return
 * @returns {Array} Array of suggested Date objects
 */
const suggestReminderTimes = (user, count = 3) => {
  const now = new Date();
  const suggestions = [];
  const preferredHours = user.behaviorData?.preferredHours || [9, 12, 18];

  // Generate suggestions for next 7 days
  for (let dayOffset = 0; dayOffset <= 7 && suggestions.length < count; dayOffset++) {
    for (const hour of preferredHours) {
      const suggested = new Date(now);
      suggested.setDate(now.getDate() + dayOffset);
      suggested.setHours(hour, 0, 0, 0);

      // Only suggest future times
      if (suggested > now) {
        suggestions.push({
          datetime: suggested,
          reason: `Based on your activity, you're most productive around ${formatHour(hour)}`,
          confidence: calculateConfidence(user, hour),
        });

        if (suggestions.length >= count) break;
      }
    }
  }

  // Sort by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, count);
};

/**
 * Detect missed reminders and create reschedule suggestions
 * @param {Array} reminders - Array of reminder documents
 * @returns {Array} Reminders that are missed and need rescheduling
 */
const detectMissedReminders = (reminders) => {
  const now = new Date();
  return reminders.filter(
    (r) => r.status === 'pending' && r.dueDate < now && !r.notificationSent
  );
};

/**
 * Auto-reschedule a missed reminder to the next optimal time
 * @param {Object} reminder - Reminder document
 * @param {Object} user - User document
 * @returns {Date} New suggested due date
 */
const autoReschedule = (reminder, user) => {
  const now = new Date();
  const preferredHours = user.behaviorData?.preferredHours || [9, 12, 18];

  // Find next preferred hour
  const currentHour = now.getHours();
  const nextHour =
    preferredHours.find((h) => h > currentHour) ||
    preferredHours[0]; // Wrap to next day

  const newDate = new Date(now);

  if (nextHour <= currentHour) {
    newDate.setDate(now.getDate() + 1);
  }

  newDate.setHours(nextHour, 0, 0, 0);
  return newDate;
};

/**
 * Calculate smart notification time (X minutes before due)
 * @param {Date} dueDate
 * @param {Number} advanceMinutes
 * @returns {Date}
 */
const calculateNotificationTime = (dueDate, advanceMinutes = 15) => {
  const notifTime = new Date(dueDate);
  notifTime.setMinutes(notifTime.getMinutes() - advanceMinutes);
  return notifTime;
};

/**
 * Get analytics summary for a user's reminders
 * @param {Array} reminders
 * @returns {Object} Analytics data
 */
const generateAnalytics = (reminders) => {
  const total = reminders.length;
  const completed = reminders.filter((r) => r.status === 'completed').length;
  const missed = reminders.filter((r) => r.status === 'missed').length;
  const pending = reminders.filter((r) => r.status === 'pending').length;

  // By category
  const byCategory = {};
  reminders.forEach((r) => {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  });

  // By priority
  const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
  reminders.forEach((r) => {
    byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
  });

  // Completion rate by day of week
  const byDayOfWeek = Array(7).fill(0).map(() => ({ created: 0, completed: 0 }));
  reminders.forEach((r) => {
    const day = new Date(r.createdAt).getDay();
    byDayOfWeek[day].created += 1;
    if (r.status === 'completed') byDayOfWeek[day].completed += 1;
  });

  // Last 7 days activity
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStr = date.toISOString().split('T')[0];
    const dayReminders = reminders.filter(
      (r) => r.createdAt.toISOString().split('T')[0] === dayStr
    );
    last7Days.push({
      date: dayStr,
      created: dayReminders.length,
      completed: dayReminders.filter((r) => r.status === 'completed').length,
    });
  }

  return {
    total,
    completed,
    missed,
    pending,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    byCategory,
    byPriority,
    byDayOfWeek,
    last7Days,
    streak: calculateStreak(reminders),
  };
};

// --- Helpers ---

const formatHour = (hour) => {
  if (hour === 0) return '12:00 AM';
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return '12:00 PM';
  return `${hour - 12}:00 PM`;
};

const calculateConfidence = (user, hour) => {
  const completions = user.behaviorData?.completionsByHour?.get(String(hour)) || 0;
  const total = user.behaviorData?.totalCompleted || 1;
  return Math.min(100, Math.round((completions / total) * 100) + 30);
};

const calculateStreak = (reminders) => {
  const completedDates = reminders
    .filter((r) => r.status === 'completed' && r.completedAt)
    .map((r) => r.completedAt.toISOString().split('T')[0])
    .sort()
    .reverse();

  if (!completedDates.length) return 0;

  let streak = 1;
  for (let i = 1; i < completedDates.length; i++) {
    const prev = new Date(completedDates[i - 1]);
    const curr = new Date(completedDates[i]);
    const diff = (prev - curr) / (1000 * 60 * 60 * 24);
    if (diff === 1) streak++;
    else break;
  }

  return streak;
};

module.exports = {
  suggestReminderTimes,
  detectMissedReminders,
  autoReschedule,
  calculateNotificationTime,
  generateAnalytics,
};
