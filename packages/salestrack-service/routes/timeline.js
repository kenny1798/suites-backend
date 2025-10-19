const router = require('express').Router();
const ctrl = require('../controllers/timeline.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

// GET /api/salestrack/opportunities/:id/timeline?teamId=1
router.get('/opportunities/:id/timeline', ctrl.getTimeline);

module.exports = router;
