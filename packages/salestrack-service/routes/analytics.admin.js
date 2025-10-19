const router = require('express').Router();
const ctrl = require('../controllers/analytics.admin.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

// dropdown data for Owner/Admin (managers and their reps)
router.get('/analytics/admin/list-managers', ctrl.listManagersAndReps);

// Summary for Owner/Admin with flexible scopes
router.get('/analytics/admin/summary', ctrl.adminSummary);

// NEW: Sheet (daily buckets for graphs/table)
router.get('/analytics/admin/sheet', ctrl.adminSheet);

router.get('/analytics/admin/conversions', ctrl.adminConversions);

module.exports = router;
