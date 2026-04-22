require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const reminderRoutes = require('./routes/reminders');
const analyticsRoutes = require('./routes/analytics');
const Reminder = require('./models/Reminder');
const User = require('./models/User');

// Connect Database
connectDB();

const app = express();
const httpServer = http.createServer(app);

// ── Socket.IO Setup ───────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket.IO Authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id} (user: ${socket.userId})`);

  // Join user's private room
  socket.join(socket.userId);

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });

  // Allow client to join their room manually
  socket.on('join', (userId) => {
    if (userId === socket.userId) {
      socket.join(userId);
    }
  });
});

// Make io accessible to routes
app.set('io', io);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

app.use('/api', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Server error' : err.message,
  });
});

// ── Cron Jobs ─────────────────────────────────────────────────────────────────

// Every minute: check for due reminders and send real-time notifications
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const oneMinuteLater = new Date(now.getTime() + 60 * 1000);

    const dueReminders = await Reminder.find({
      status: 'pending',
      notificationTime: { $gte: now, $lte: oneMinuteLater },
      notificationSent: false,
    }).populate('user', '_id name');

    for (const reminder of dueReminders) {
      // Send real-time notification
      io.to(reminder.user._id.toString()).emit('notification', {
        type: 'reminder_due',
        reminder: {
          id: reminder._id,
          title: reminder.title,
          dueDate: reminder.dueDate,
          priority: reminder.priority,
        },
        message: `⏰ Reminder: "${reminder.title}" is due soon!`,
      });

      // Mark notification as sent
      reminder.notificationSent = true;
      await reminder.save();
    }
  } catch (error) {
    console.error('Cron notification error:', error);
  }
});

// Every hour: auto-detect missed reminders and notify
cron.schedule('0 * * * *', async () => {
  try {
    const now = new Date();
    const missed = await Reminder.find({
      status: 'pending',
      dueDate: { $lt: now },
    }).populate('user', '_id');

    for (const reminder of missed) {
      reminder.status = 'missed';
      reminder.missedAt = now;
      await reminder.save();

      io.to(reminder.user._id.toString()).emit('notification', {
        type: 'reminder_missed',
        reminder: { id: reminder._id, title: reminder.title },
        message: `⚠️ You missed: "${reminder.title}". Tap to reschedule.`,
      });

      // Update user behavior
      await User.findByIdAndUpdate(reminder.user._id, {
        $inc: {
          'behaviorData.totalMissed': 1,
        },
      });
    }

    if (missed.length > 0) {
      console.log(`⏰ Marked ${missed.length} reminders as missed`);
    }
  } catch (error) {
    console.error('Cron missed-detection error:', error);
  }
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Smart Reminder Server running on port ${PORT}`);
  console.log(`📡 Socket.IO enabled`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

// Handle unhandled rejections — log only, do NOT exit
// (Exiting on transient DB drops kills the whole server)
process.on('unhandledRejection', (err) => {
  console.error('⚠️  Unhandled Promise Rejection:', err.message);
});

// Graceful shutdown on SIGTERM (e.g. Render / Railway)
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed.');
    process.exit(0);
  });
});
