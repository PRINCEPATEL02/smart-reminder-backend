const mongoose = require('mongoose');

const historySchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        task: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Task',
        },
        date: {
            type: Date,
            required: true,
        },
        scheduledTime: {
            type: String, // "HH:mm" format
            required: true,
        },
        status: {
            type: String,
            enum: ['Completed', 'Skipped', 'Missed'],
            default: 'Completed',
        },
        completionTime: {
            type: Date,
        },
        notes: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

// Index for faster queries
historySchema.index({ user: 1, date: -1 });
historySchema.index({ task: 1, date: -1 });

const History = mongoose.model('History', historySchema);
module.exports = History;
