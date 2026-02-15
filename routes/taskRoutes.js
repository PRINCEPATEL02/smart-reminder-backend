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
    resetDailyCompletions,
    getStats
} = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

// All routes are protected
router.use(protect);

router.route('/')
    .get(getTasks)
    .post(createTask);

// Stats route must be before /:id route to avoid matching :id with 'stats'
router.get('/stats', getStats);
router.get('/completed/today', getTodayCompletedTasks);
router.post('/reset-daily', resetDailyCompletions);

router.route('/:id')
    .get(getTaskById)
    .put(updateTask)
    .delete(deleteTask);

router.post('/:id/complete', markTaskComplete);

module.exports = router;
