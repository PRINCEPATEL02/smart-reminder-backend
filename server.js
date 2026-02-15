const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        // Also allow localhost for development
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'https://smart-reminder-frontend.onrender.com',
            'https://smart-reminder-frontend-*.onrender.com',
            undefined
        ];

        // Check if origin matches any allowed pattern (including wildcard subdomains)
        const isAllowed = !origin || allowedOrigins.some(allowed =>
            allowed === origin ||
            (allowed?.includes('*') && new RegExp(allowed.replace('*', '.*')).test(origin))
        );

        if (isAllowed) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
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
    const isProduction = process.env.NODE_ENV === 'production';
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(isProduction
        ? `🌐 Smart Reminder API ready at https://smart-reminder-backend-cg3w.onrender.com`
        : `📱 Smart Reminder API ready at http://localhost:${PORT}`
    );
});
