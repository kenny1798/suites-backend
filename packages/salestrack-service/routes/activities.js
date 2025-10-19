const router = require('express').Router();
const ctrl = require('../controllers/activities.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

// GET /api/salestrack/opportunities/:id/activities?teamId=1
router.get('/opportunities/:id/activities', ctrl.listActivities);

// POST /api/salestrack/opportunities/:id/activities
router.post('/opportunities/:id/activities', ctrl.createActivity);

module.exports = router;
