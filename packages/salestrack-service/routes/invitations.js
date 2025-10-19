// routes/invitations.js
const router = require('express').Router();
const { validateToken } = require('../middlewares/validateToken');
const ctrl = require('../controllers/invitations.controller');

// ---------- PUBLIC RESOLVE ----------
router.get('/invite/resolve/:teamId/:hash/:inviterId', ctrl.resolveInviteLink);
router.get('/invite/resolve/:teamId/:hash/:pos/:inviterId', ctrl.resolveInviteLink);

// ---------- AUTH: REQUEST ----------
router.post('/invite/request/:teamId/:hash/:inviterId', validateToken, ctrl.requestJoin);
router.post('/invite/request/:teamId/:hash/:pos/:inviterId', validateToken, ctrl.requestJoin);

// ---------- AUTH: MANAGE LIST/APPROVAL ----------
router.get('/teams/:teamId/join-requests', validateToken, ctrl.listJoinRequests);
router.post('/teams/:teamId/join-requests/:id/approve', validateToken, ctrl.approveJoinRequest);
router.post('/teams/:teamId/join-requests/:id/reject',  validateToken, ctrl.rejectJoinRequest);

// Hash rasmi untuk bina link (authenticated)
router.get('/teams/:teamId/invite-hash', validateToken, ctrl.getInviteHash);

router.get('/invite/test', validateToken, ctrl.test);

module.exports = router;
