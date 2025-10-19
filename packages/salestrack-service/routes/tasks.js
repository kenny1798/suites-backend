const router = require('express').Router();
const ctrl = require('../controllers/tasks.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

router.get('/tasks', ctrl.listTasks);

router.post('/opportunities/:id/tasks', ctrl.createTaskForOpportunity);

router.patch('/tasks/:id', ctrl.patchTask);

router.get('/tasks/filter', ctrl.filterTasks);

module.exports = router;
