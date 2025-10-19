const router = require('express').Router();
const ctrl = require('../controllers/followups.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

// GET /api/salestrack/followups/summary?teamId=1&from=YYYY-MM-DD&to=YYYY-MM-DD&scope=mine|team
router.get('/followups/summary', ctrl.summary);

module.exports = router;
