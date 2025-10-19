// routes/teams.js
const router = require('express').Router();
const teamsController = require('../controllers/teams.controller');
const products = require('../controllers/products.controller');
const { validateToken } = require('../middlewares/validateToken');
const { isOwner, isMember, canAdminTeam } = require('../middlewares/authTeam');
const { requireSalestrackSetupEntitlement } = require('../middlewares/plan.guard');

router.use(validateToken);

// Teams base
router.post('/', teamsController.createTeam);
router.get('/', teamsController.getMyTeams);

// 🔹 Settings: get & update team name
router.get('/:teamId', isMember, teamsController.getTeam);
router.put('/:teamId', canAdminTeam, teamsController.updateTeam);

// Members
router.post('/:teamId/members', canAdminTeam, teamsController.inviteMember);
router.get('/:teamId/members', isMember, teamsController.listMembers);
router.get('/:teamId/members/visible', isMember, teamsController.listVisibleMembers);

// Pipeline
router.get('/:teamId/statuses', isMember, teamsController.getTeamStatuses);
// OWNER only untuk ubah pipeline (tukar ke canAdminTeam jika nak admin pun boleh)
router.post('/:teamId/statuses', isOwner, teamsController.bulkCreateOrUpdateStatuses);

// Setup (gabungan) — entitlement check; validateToken dah apply kat atas, tak perlu duplicate
router.post('/setup', requireSalestrackSetupEntitlement, teamsController.setupTeamWithPipeline);

router.get('/:teamId/products', isMember, products.list);
router.post('/:teamId/products', canAdminTeam, products.create);
router.put('/:teamId/products/:productId', canAdminTeam, products.update);
router.delete('/:teamId/products/:productId', canAdminTeam, products.softDelete);
router.post('/:teamId/products/:productId/restore', canAdminTeam, products.restore);



module.exports = router;
