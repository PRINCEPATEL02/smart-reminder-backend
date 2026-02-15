const mongoose = require('mongoose');

const taskSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: '',
        },
        type: {
            type: String,
            enum: ['Habit', 'Medicine', 'Meeting', 'Custom', 'Water', 'Work'],
            required: true,
        },
        scheduleType: {
            type: String,
            enum: ['Daily', 'SelectedDays', 'Random'],
            required: true,
        },
        selectedDays: {
            type: [Number], // 0-6 for Sun-Sat
            default: [0, 1, 2, 3, 4, 5, 6],
        },
        randomDays: {
            type: Number, // Number of random days per week
            min: 1,
            max: 7,
            default: 3,
        },
        times: {
            type: [String], // ["HH:mm"] format
            required: true,
            default: ['08:00'],
        },
        notificationType: {
            type: String,
            enum: ['Push', 'Sound', 'Both'],
            default: 'Push',
        },
        reminderBefore: {
            type: Number,
            default: 5, // minutes before task time to send notification
            min: 1,
            max: 60,
        },
        priority: {
            type: String,
            enum: ['Low', 'Medium', 'High', 'Critical'],
            default: 'Medium',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Medicine specific fields
        medicineDetails: {
            dosage: String,
            instructions: {
                type: String,
                enum: ['Before Food', 'After Food', 'Anytime'],
            },
            stock: Number,
        },
    },
    {
        timestamps: true,
    }
);

// Index for faster queries
taskSchema.index({ user: 1, isActive: 1 });
taskSchema.index({ user: 1, type: 1 });

const Task = mongoose.model('Task', taskSchema);
module.exports = Task;
