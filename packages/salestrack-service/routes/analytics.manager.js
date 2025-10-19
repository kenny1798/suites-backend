const router = require('express').Router();
const ctrl = require('../controllers/analytics.manager.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

// Summary untuk manager (overall atau single rep)
router.get('/analytics/manager/reps', ctrl.listMyReps);
router.get('/analytics/manager/summary', ctrl.managerSummary);
router.get('/analytics/manager/sheet', ctrl.managerSheet);

// NEW: Individual rep view (manager scopes to one rep)
router.get('/analytics/manager/rep/summary', ctrl.managerRepSummary);
router.get('/analytics/manager/rep/sheet',    ctrl.managerRepSheet);
router.get('/analytics/manager/conversions', ctrl.managerConversions);

module.exports = router;
