// salestrack-service/routes/targets.routes.js
const router = require('express').Router();
const ctrl = require('../controllers/targets.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

// 1) FE guna endpoint ini sekali je → server pulangkan role + rows yg layak
router.get('/teams/:teamId/targets/role-view', ctrl.roleView);

// 2) Update target untuk DIRI SENDIRI sahaja
router.put('/teams/:teamId/targets/me', ctrl.upsertMyTarget);

module.exports = router;
