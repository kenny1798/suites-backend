// middlewares/targetsGuards.js
const { TeamMembers } = require('@suites/database-models');

async function attachMembership(req, res, next) {
  try {
    const teamId = Number(req.params.teamId || req.query.teamId || req.body.teamId);
    if (!teamId) return res.status(400).json({ error: 'teamId is required' });
    const m = await TeamMembers.findOne({ where: { teamId, userId: req.user.id } });
    if (!m) return res.status(403).json({ error: 'Forbidden: not a team member' });
    req.membership = m; // { id, teamId, userId, role }
    next();
  } catch (e) {
    res.status(500).json({ error: 'Permission check failed.' });
  }
}

// Hanya larang OWNER/ADMIN dari akses /targets/me
function forbidOwnerAdminSelf(req, res, next) {
  const role = req.membership?.role;
  if (role === 'OWNER' || role === 'ADMIN') {
    return res.status(403).json({ error: 'Owners/Admins cannot set or view personal targets.' });
  }
  next();
}

module.exports = { attachMembership, forbidOwnerAdminSelf };
