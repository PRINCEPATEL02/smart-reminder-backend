const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            // Connection settings for MongoDB Atlas
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`   Database: ${conn.connection.name}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        console.error(`   Error Code: ${error.code}`);

        // Check for common Atlas issues
        if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
            console.error('⚠️ DNS resolution failed. Check your connection string and network.');
        } else if (error.message.includes('Authentication failed')) {
            console.error('⚠️ Authentication failed. Check username/password in MONGODB_URI.');
        } else if (error.message.includes('IP Address not whitelisted')) {
            console.error('⚠️ IP not whitelisted. Go to MongoDB Atlas → Network Access → Add IP Address.');
        }

        console.log('⚠️ Server running without MongoDB connection. Some features may be unavailable.');
        console.log('⚠️ Please check your MongoDB Atlas network access settings.');
    }
};

module.exports = connectDB;
