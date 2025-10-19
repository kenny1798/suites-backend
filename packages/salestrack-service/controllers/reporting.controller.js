// salestrack-service/controllers/reporting.controller.js
const { TeamReporting, TeamMembers, Users } = require('@suites/database-models');
const { Op } = require('sequelize');

async function getRole(userId, teamId) {
  const m = await TeamMembers.findOne({ where: { userId, teamId } });
  return m?.role || null;
}

// OWNER/ADMIN: assign / reassign rep → manager
exports.assignRepToManager = async (req, res) => {
  const { teamId } = req.params;
  const { repUserId, managerUserId } = req.body;

  const role = await getRole(req.user.id, teamId);
  if (!(role === 'OWNER' || role === 'ADMIN')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Validate both are members of the same team
  const [rep, mgr] = await Promise.all([
    TeamMembers.findOne({ where: { teamId, userId: repUserId } }),
    TeamMembers.findOne({ where: { teamId, userId: managerUserId, role: 'MANAGER' } }),
  ]);
  if (!rep) return res.status(400).json({ error: 'Rep is not a team member.' });
  if (!mgr) return res.status(400).json({ error: 'Manager is not a valid manager in this team.' });

  await TeamReporting.findOrCreate({
    where: { teamId, managerUserId, repUserId },
    defaults: { teamId, managerUserId, repUserId },
  });

  res.json({ ok: true });
};

// OWNER/ADMIN: remove link
exports.removeRepFromManager = async (req, res) => {
  const { teamId } = req.params;
  const { repUserId, managerUserId } = req.query;

  const role = await getRole(req.user.id, teamId);
  if (!(role === 'OWNER' || role === 'ADMIN')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await TeamReporting.destroy({ where: { teamId, managerUserId, repUserId } });
  res.json({ ok: true });
};

// OWNER/ADMIN: list all reporting pairs; MANAGER: only his reps
exports.listReporting = async (req, res) => {
  const { teamId } = req.params;
  const me = req.user.id;
  const role = await getRole(me, teamId);
  if (!role) return res.status(403).json({ error: 'Forbidden' });

  const where = (role === 'OWNER' || role === 'ADMIN')
    ? { teamId }
    : { teamId, managerUserId: me };

  const rows = await TeamReporting.findAll({
    where,
    include: [
      { model: Users, as: 'Manager', attributes: ['id','name','email'] },
      { model: Users, as: 'Rep', attributes: ['id','name','email'] },
    ],
    order: [['managerUserId','ASC'], ['repUserId','ASC']],
  });

  res.json(rows);
};

// MANAGER (or OWNER/ADMIN): list reps of a manager
exports.listManagerReps = async (req, res) => {
  const { teamId, managerUserId } = req.params;
  const me = req.user.id;
  const role = await getRole(me, teamId);
  if (!role) return res.status(403).json({ error: 'Forbidden' });

  // Manager hanya boleh lihat team sendiri
  if (role === 'MANAGER' && String(me) !== String(managerUserId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const rows = await TeamReporting.findAll({
    where: { teamId, managerUserId },
    include: [{ model: Users, as: 'Rep', attributes: ['id','name','email'] }],
    order: [['repUserId','ASC']],
  });

  res.json(rows.map(r => r.Rep));
};
