const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// DEBUG: Log JWT_SECRET immediately after loading dotenv
console.log('🔍 Server startup - JWT_SECRET:', process.env.JWT_SECRET);
console.log('🔍 Server startup - JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'UNDEFINED');

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Smart Reminder API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    // Write error to file for debugging
    const fs = require('fs');
    fs.appendFileSync('backend_errors.log', `${new Date().toISOString()} - ${err.stack}\n\n`);
    res.status(500).json({
        success: false,
        message: 'Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Smart Reminder API ready at http://localhost:${PORT}`);
});
