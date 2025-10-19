// salestrack-service/routes/targets.routes.js
const router = require('express').Router();
const ctrl = require('../controllers/targets.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

router.get('/targets', ctrl.listTargets);
router.put('/targets', ctrl.upsertTarget);
router.delete('/targets/:id', ctrl.deleteTarget);

module.exports = router;
