// salestrack-service/routes/reporting.js
const router = require('express').Router();
const { validateToken } = require('../middlewares/validateToken');
const ctrl = require('../controllers/reporting.controller');

router.use(validateToken);

// List semua pair (Owner/Admin) atau only own (Manager)
router.get('/teams/:teamId/reporting', ctrl.listReporting);

// List reps bagi seorang manager
router.get('/teams/:teamId/managers/:managerUserId/reps', ctrl.listManagerReps);

// Assign / remove (Owner/Admin sahaja)
router.post('/teams/:teamId/reporting/assign', ctrl.assignRepToManager);
router.delete('/teams/:teamId/reporting/assign', ctrl.removeRepFromManager);

module.exports = router;
