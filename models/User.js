const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    // Smart behavior tracking
    behaviorData: {
      preferredHours: {
        type: [Number],
        default: [9, 12, 18], // Default: 9am, 12pm, 6pm
      },
      completionsByHour: {
        type: Map,
        of: Number,
        default: {},
      },
      avgCompletionRate: {
        type: Number,
        default: 0,
      },
      totalCreated: { type: Number, default: 0 },
      totalCompleted: { type: Number, default: 0 },
      totalMissed: { type: Number, default: 0 },
      lastActive: { type: Date, default: Date.now },
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      advanceMinutes: { type: Number, default: 15 },
    },
    darkMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Update behavior data after task completion
userSchema.methods.updateBehavior = function (hour, completed) {
  const hourKey = String(hour);
  const current = this.behaviorData.completionsByHour.get(hourKey) || 0;
  this.behaviorData.completionsByHour.set(hourKey, current + (completed ? 1 : 0));

  if (completed) {
    this.behaviorData.totalCompleted += 1;
  } else {
    this.behaviorData.totalMissed += 1;
  }

  const total = this.behaviorData.totalCompleted + this.behaviorData.totalMissed;
  this.behaviorData.avgCompletionRate =
    total > 0 ? (this.behaviorData.totalCompleted / total) * 100 : 0;

  // Recalculate preferred hours (top 3 by completions)
  const hourEntries = [...this.behaviorData.completionsByHour.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  this.behaviorData.preferredHours = hourEntries.slice(0, 3).map(([h]) => Number(h));
  this.behaviorData.lastActive = new Date();
};

// Note: email index is auto-created by unique:true above

module.exports = mongoose.model('User', userSchema);
