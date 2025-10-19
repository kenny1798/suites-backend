const router = require('express').Router();
const ctrl = require('../controllers/opportunities.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

// create + list (existing)
router.post('/', ctrl.createOpportunity);
router.get('/', ctrl.getOpportunities);

// new
router.put('/:id', ctrl.updateOpportunity);
router.post('/:id/move', ctrl.moveOpportunity);
router.post('/:id/assign', ctrl.assignOpportunity);

module.exports = router;
