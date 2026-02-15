const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const protect = asyncHandler(async (req, res, next) => {
    let token;

    // Check for Authorization header (case-insensitive)
    const authHeader = req.headers.authorization || req.headers.Authorization;

    // DEBUG: Log the authorization header (remove in production)
    console.log('Auth header:', authHeader);

    if (authHeader && (authHeader.startsWith('Bearer ') || authHeader.startsWith('bearer '))) {
        try {
            token = authHeader.split(' ')[1];
            console.log('Token extracted:', token ? 'Yes' : 'No');

            // DEBUG: Log the JWT_SECRET being used
            console.log('JWT_SECRET from env:', process.env.JWT_SECRET);
            console.log('JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'UNDEFINED');
            console.log('Token payload:', JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                res.status(401);
                throw new Error('User not found - please login again');
            }

            next();
        } catch (error) {
            console.error('Auth error:', error.message);
            if (error.name === 'TokenExpiredError') {
                res.status(401);
                throw new Error('Session expired - please login again');
            }
            if (error.name === 'JsonWebTokenError') {
                res.status(401);
                throw new Error('Invalid token - please login again');
            }
            res.status(401);
            throw new Error('Not authorized, token failed');
        }
    }

    if (!token) {
        // Check if this is a public route
        if (req.path.startsWith('/auth/login') || req.path.startsWith('/auth/register')) {
            return next();
        }
        res.status(401);
        throw new Error('Not logged in - please login first');
    }
});

module.exports = { protect };
