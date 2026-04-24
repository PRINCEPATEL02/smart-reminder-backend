const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    category: {
      type: String,
      enum: ['work', 'personal', 'health', 'finance', 'education', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'missed', 'snoozed'],
      default: 'pending',
      index: true,
    },
    tags: [{ type: String, trim: true }],
    isHabit: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Recurrence
    recurrence: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none',
    },
    // Smart fields
    isSmartSuggested: { type: Boolean, default: false },
    originalDueDate: { type: Date }, // For tracking reschedules
    snoozeCount: { type: Number, default: 0 },
    // Notifications
    notificationSent: { type: Boolean, default: false },
    notificationTime: { type: Date },
    // Completion tracking
    completedAt: { type: Date },
    lastCompletedAt: { type: Date },
    lastCompletedPeriodKey: { type: String },
    streakCurrent: { type: Number, default: 0 },
    streakBest: { type: Number, default: 0 },
    // For missed task detection
    missedAt: { type: Date },
    rescheduleCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: isOverdue
reminderSchema.virtual('isOverdue').get(function () {
  return (
    this.status === 'pending' &&
    this.dueDate < new Date()
  );
});

// Virtual: daysUntilDue
reminderSchema.virtual('daysUntilDue').get(function () {
  const now = new Date();
  const diff = this.dueDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Compound indexes for common queries
reminderSchema.index({ user: 1, status: 1 });
reminderSchema.index({ user: 1, dueDate: 1 });
reminderSchema.index({ user: 1, priority: 1, status: 1 });
reminderSchema.index({ user: 1, category: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
