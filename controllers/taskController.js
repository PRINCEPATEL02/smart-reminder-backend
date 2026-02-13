const asyncHandler = require('express-async-handler');
const Task = require('../models/Task');
const History = require('../models/History');

// @desc    Get all tasks for logged in user
// @route   GET /api/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
    const tasks = await Task.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(tasks);
});

// @desc    Get single task by ID
// @route   GET /api/tasks/:id
// @access  Private
const getTaskById = asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    if (task.user.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('Not authorized');
    }

    res.json(task);
});

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
const createTask = asyncHandler(async (req, res) => {
    const {
        title,
        type,
        description,
        priority,
        notificationType,
        schedule,
        times,
        medicineDetails,
        isActive,
    } = req.body;

    if (!title || !type) {
        res.status(400);
        throw new Error('Please add title and type');
    }

    const task = await Task.create({
        user: req.user._id,
        title,
        type,
        description: description || '',
        priority: priority || 'Medium',
        notificationType: notificationType || 'Push',
        scheduleType: schedule?.type || 'Daily',
        selectedDays: schedule?.type === 'SelectedDays' ? (schedule.days || []) : [],
        randomDays: schedule?.type === 'Random' ? (schedule.randomCount || 3) : undefined,
        times: times || ['08:00'],
        medicineDetails: type === 'Medicine' ? medicineDetails : undefined,
        isActive: isActive !== false,
    });

    res.status(201).json(task);
});

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    if (task.user.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('Not authorized');
    }

    const {
        title,
        type,
        description,
        priority,
        notificationType,
        schedule,
        times,
        medicineDetails,
        isActive,
    } = req.body;

    // Build update object
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (type !== undefined) updateData.type = type;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (notificationType !== undefined) updateData.notificationType = notificationType;
    if (times !== undefined) updateData.times = times;
    if (isActive !== undefined) updateData.isActive = isActive;

    if (schedule) {
        updateData.scheduleType = schedule.type;
        if (schedule.type === 'SelectedDays') {
            updateData.selectedDays = schedule.days || [];
        }
        if (schedule.type === 'Random') {
            updateData.randomDays = schedule.randomCount || 3;
        }
    }

    if (type === 'Medicine' && medicineDetails) {
        updateData.medicineDetails = medicineDetails;
    }

    const updatedTask = await Task.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
    );

    res.json(updatedTask);
});

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private
const deleteTask = asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    if (task.user.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('Not authorized');
    }

    await task.deleteOne();

    res.json({ id: req.params.id });
});

// @desc    Mark task as completed for today
// @route   POST /api/tasks/:id/complete
// @access  Private
const markTaskComplete = asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    if (task.user.toString() !== req.user._id.toString()) {
        res.status(401);
        throw new Error('Not authorized');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already completed today
    const existingHistory = await History.findOne({
        user: req.user._id,
        task: task._id,
        date: today,
    });

    if (existingHistory) {
        res.status(400);
        throw new Error('Task already completed today');
    }

    const history = await History.create({
        user: req.user._id,
        task: task._id,
        date: today,
        scheduledTime: req.body.scheduledTime || task.times[0] || 'ALL',
        status: 'Completed',
        completionTime: new Date(),
    });

    res.status(201).json(history);
});

// @desc    Get today's completed tasks
// @route   GET /api/tasks/completed/today
// @access  Private
const getTodayCompletedTasks = asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedTasks = await History.find({
        user: req.user._id,
        date: today,
        status: 'Completed',
    }).select('task');

    res.json(completedTasks.map(h => h.task));
});

// @desc    Reset all task completions for new day
// @route   POST /api/tasks/reset-daily
// @access  Private (usually called by scheduler)
const resetDailyCompletions = asyncHandler(async (req, res) => {
    // This endpoint can be called to clear/reset daily tasks
    // In this implementation, completions are per-day so they auto-reset
    res.json({ message: 'Tasks reset for new day' });
});

module.exports = {
    getTasks,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
    markTaskComplete,
    getTodayCompletedTasks,
    resetDailyCompletions,
};
