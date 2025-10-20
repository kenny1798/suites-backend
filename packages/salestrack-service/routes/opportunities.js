// salestrack-service/routes/opportunities.js
const router = require('express').Router();
const ctrl = require('../controllers/opportunities.controller');
const { validateToken } = require('../middlewares/validateToken');

router.use(validateToken);

// create + list (existing)
router.post('/', ctrl.createOpportunity);
router.get('/', ctrl.getOpportunities);
router.get('/deleted', ctrl.getDeletedOpportunities);

// new
router.put('/:id', ctrl.updateOpportunity);
router.post('/:id/move', ctrl.moveOpportunity);
router.post('/:id/assign', ctrl.assignOpportunity);

router.delete('/:id', ctrl.deleteOpportunity);
router.delete('/:id/timeline/:kind/:rowId', ctrl.deleteTimelineItem);
router.post('/:id/restore', ctrl.restoreOpportunity);

module.exports = router;
