// middlewares/authTeam.js
const { TeamMembers } = require('@suites/database-models');

// Fungsi bantuan untuk dapatkan role pengguna dalam team
const getMembership = (userId, teamId) => {
  if (!userId || !teamId) return null;
  return TeamMembers.findOne({ where: { userId, teamId } });
};

// Middleware 1: Pastikan pengguna adalah AHLI team (mana-mana role)
const isMember = async (req, res, next) => {
  try {
    const membership = await getMembership(req.user.id, req.params.teamId);
    if (membership) {
      req.membership = membership;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: You are not a member of this team.' });
  } catch (e) { res.status(500).json({ error: 'Permission check failed.' }) }
};

// Middleware 2: Pastikan pengguna adalah MANAGER atau ke atas
const canManageTeam = async (req, res, next) => {
  try {
    const membership = await getMembership(req.user.id, req.params.teamId);
    if (membership && ['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
      req.membership = membership;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: Manager access or higher required.' });
  } catch (e) { res.status(500).json({ error: 'Permission check failed.' }) }
};

// Middleware 3: Pastikan pengguna adalah ADMIN atau ke atas
const canAdminTeam = async (req, res, next) => {
  try {
    const membership = await getMembership(req.user.id, req.params.teamId);
    if (membership && ['OWNER', 'ADMIN'].includes(membership.role)) {
      req.membership = membership;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: Admin access or higher required.' });
  } catch (e) { res.status(500).json({ error: 'Permission check failed.' }) }
};

// Middleware 4: Pastikan pengguna adalah OWNER sahaja (YANG HILANG)
const isOwner = async (req, res, next) => {
  try {
    const membership = await getMembership(req.user.id, req.params.teamId);
    if (membership && membership.role === 'OWNER') {
      req.membership = membership;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden: Owner access required.' });
  } catch (e) { res.status(500).json({ error: 'Permission check failed.' }) }
};

module.exports = { isMember, canManageTeam, canAdminTeam, isOwner };