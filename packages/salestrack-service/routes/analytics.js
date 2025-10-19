const router = require('express').Router();
const { validateToken } = require('../middlewares/validateToken');
const ctrl = require('../controllers/analytics.personal.controller');

router.use(validateToken);

router.get('/analytics/personal/summary', ctrl.personalSummary);
router.get('/analytics/personal/sheet', ctrl.personalSheet);
router.get('/analytics/personal/conversions',ctrl.personalConversions);

module.exports = router;
