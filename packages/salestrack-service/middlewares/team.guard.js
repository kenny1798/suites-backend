// middlewares/team.guard.js
const { Teams, TeamMembers } = require('../models');

// OWNER only
exports.requireTeamOwner = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { teamId } = req.params;
    const team = await Teams.findByPk(teamId);
    if (!team) return res.status(404).json({ error: 'TEAM_NOT_FOUND' });
    if (team.ownerId !== userId) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Owner permission required.' });
    }
    req.team = team;
    next();
  } catch (e) {
    res.status(500).json({ error: 'TEAM_GUARD_FAILED', details: e.message });
  }
};

// OPTIONAL: Owner or Manager
exports.requireOwnerOrManager = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { teamId } = req.params;
    const team = await Teams.findByPk(teamId);
    if (!team) return res.status(404).json({ error: 'TEAM_NOT_FOUND' });

    if (team.ownerId === userId) {
      req.team = team;
      return next();
    }
    const mem = await TeamMembers.findOne({ where: { teamId, userId } });
    if (mem && (mem.role === 'MANAGER' || mem.role === 'OWNER')) {
      req.team = team;
      return next();
    }
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Manager or Owner required.' });
  } catch (e) {
    res.status(500).json({ error: 'TEAM_GUARD_FAILED', details: e.message });
  }
};
