const express = require('express');
const router = express.Router();
const {
    getTasks,
    createTask,
    updateTask,
    deleteTask,
    markTaskComplete,
    getTaskById,
    getTodayCompletedTasks,
    resetDailyCompletions
} = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

// All routes are protected
router.use(protect);

router.route('/')
    .get(getTasks)
    .post(createTask);

router.route('/:id')
    .get(getTaskById)
    .put(updateTask)
    .delete(deleteTask);

router.post('/:id/complete', markTaskComplete);
router.get('/completed/today', getTodayCompletedTasks);
router.post('/reset-daily', resetDailyCompletions);

module.exports = router;
