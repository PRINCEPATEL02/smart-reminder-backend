const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
        },
        pushSubscriptions: [
            {
                endpoint: String,
                expirationTime: Number,
                keys: {
                    p256dh: String,
                    auth: String,
                },
            },
        ],
        settings: {
            theme: { type: String, default: 'light' },
            timezone: { type: String, default: 'UTC' },
            sleepMode: {
                enabled: { type: Boolean, default: false },
                start: { type: String, default: '22:00' },
                end: { type: String, default: '07:00' },
            },
        },
        caregiver: {
            name: String,
            contactMethod: { type: String, enum: ['email', 'sms'], default: 'email' },
            contactValue: String,
        },
    },
    {
        timestamps: true,
    }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);
module.exports = User;
