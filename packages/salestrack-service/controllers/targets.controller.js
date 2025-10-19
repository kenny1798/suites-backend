// salestrack-service/controllers/targets.controller.js
const { Op } = require('sequelize');
const {
  TeamMembers,
  TeamReporting,
  Users,
  Targets,
  Teams, // optional if you store ownerId here
} = require('@suites/database-models');

/* ---------- helpers ---------- */
async function isTeamMember(teamId, userId) {
  const tm = await TeamMembers.findOne({ where: { teamId, userId } });
  return tm || null;
}
async function repIdsUnderManager(teamId, managerUserId) {
  const links = await TeamReporting.findAll({
    where: { teamId, managerUserId },
    attributes: ['repUserId'],
  });
  return links.map(r => r.repUserId);
}

/** Try to infer role flags from TeamMembers + TeamReporting (+ Teams.ownerId if exists) */
async function getRoleFlags(teamId, userId) {
  const tm = await isTeamMember(teamId, userId);
  if (!tm) return { isMember:false, isOwnerAdmin:false, isManager:false };

  let isOwnerAdmin = false;
  // tolerate different schemas:
  if (tm.role && ['OWNER','ADMIN'].includes(String(tm.role).toUpperCase())) isOwnerAdmin = true;
  if (tm.isOwner || tm.isAdmin) isOwnerAdmin = true;

  try {
    const team = await Teams.findByPk(tm.teamId, { attributes: ['ownerId'] });
    if (team && Number(team.ownerId) === Number(userId)) isOwnerAdmin = true;
  } catch (_) {}

  const repLinks = await TeamReporting.count({ where: { teamId, managerUserId: userId } });
  const isManager = repLinks > 0;

  return { isMember:true, isOwnerAdmin, isManager };
}

/** Build candidate userIds by scope & role */
async function resolveScopeUserIds({
  teamId,
  requesterId,
  scope,               // 'self' | 'manager' | 'team' | 'managerOnly' | 'rep'
  managerUserId,       // for owner/admin selecting a manager
  repUserId,           // for owner/admin selecting a single rep
  includeManager = false, // when scope=manager and owner wants include manager in list
}) {
  const { isOwnerAdmin, isManager } = await getRoleFlags(teamId, requesterId);

  // Sales Rep: force self
  if (!isOwnerAdmin && !isManager) {
    return [requesterId];
  }

  // Manager: allow self OR their reps
  if (isManager && !isOwnerAdmin) {
    if (scope === 'manager') {
      return await repIdsUnderManager(teamId, requesterId);            // reps only
    }
    if (scope === 'rep' && repUserId) {
      const ids = await repIdsUnderManager(teamId, requesterId);
      if (!ids.includes(Number(repUserId))) return [];                 // forbidden
      return [Number(repUserId)];
    }
    // default: self
    return [requesterId];
  }

  // Owner/Admin:
  if (isOwnerAdmin) {
    if (scope === 'rep' && repUserId) return [Number(repUserId)];
    if (scope === 'manager' && managerUserId) {
      const reps = await repIdsUnderManager(teamId, Number(managerUserId));
      return includeManager ? [...reps, Number(managerUserId)] : reps;
    }
    if (scope === 'managerOnly' && managerUserId) {
      return await repIdsUnderManager(teamId, Number(managerUserId));  // explicitly exclude manager
    }
    // Whole team
    const tms = await TeamMembers.findAll({ where: { teamId }, attributes: ['userId'] });
    return tms.map(x => x.userId);
  }

  // fallback
  return [requesterId];
}

/* ---------- LIST (searchable) ---------- */
/**
 * GET /api/salestrack/targets
 * Query:
 *  - teamId, month, year (required)
 *  - scope: 'self' | 'manager' | 'team' | 'managerOnly' | 'rep'  (optional)
 *  - managerUserId (when scope=manager/managerOnly for owner/admin)
 *  - repUserId (when scope=rep for owner/admin OR manager)
 *  - q (optional, search name/email)
 */
exports.listTargets = async (req, res) => {
  try {
    const teamId = Number(req.query.teamId);
    const month  = Number(req.query.month);
    const year   = Number(req.query.year);
    const scope  = String(req.query.scope || 'self');
    const managerUserId = req.query.managerUserId ? Number(req.query.managerUserId) : null;
    const repUserId     = req.query.repUserId ? Number(req.query.repUserId) : null;
    const includeManager = String(req.query.includeManager || '') === '1';
    const q = (req.query.q || '').trim();

    const requesterId = req.user.id;

    if (!teamId || !month || !year) {
      return res.status(400).json({ error: 'teamId, month, year are required.' });
    }
    const tm = await isTeamMember(teamId, requesterId);
    if (!tm) return res.status(403).json({ error: 'Forbidden' });

    // resolve visible user ids by role + scope
    let userIds = await resolveScopeUserIds({
      teamId, requesterId, scope, managerUserId, repUserId, includeManager
    });
    if (!userIds || userIds.length === 0) {
      return res.json({ month, year, items: [] });
    }

    // apply name/email search
    const whereUser = { id: { [Op.in]: userIds } };
    if (q) {
      whereUser[Op.or] = [
        { name:  { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
      ];
    }

    const users = await Users.findAll({
      where: whereUser,
      attributes: ['id', 'name', 'email'],
      order: [['name', 'ASC']],
    });

    const targets = await Targets.findAll({
      where: { teamId, month, year, userId: { [Op.in]: users.map(u=>u.id) } },
      attributes: ['id','userId','targetValue','targetUnits'],
    });

    const byUser = new Map();
    for (const t of targets) byUser.set(t.userId, t);

    const items = users.map(u => {
      const t = byUser.get(u.id);
      return {
        userId: u.id,
        name: u.name || `User #${u.id}`,
        email: u.email || null,
        targetId: t?.id || null,
        targetValue: t?.targetValue || 0,
        targetUnits: t?.targetUnits || 0,
      };
    });

    res.json({ month, year, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to list targets.', details: e.message });
  }
};

/* ---------- UPSERT (permissioned) ---------- */
/**
 * PUT /api/salestrack/targets
 * Body: { teamId, userId, month, year, targetValue, targetUnits }
 * Permission:
 *  - Sales Rep: only self
 *  - Manager: self + reps under them
 *  - Owner/Admin: anyone in team
 */
exports.upsertTarget = async (req, res) => {
  try {
    const { teamId, userId, month, year, targetValue = 0, targetUnits = 0 } = req.body || {};
    const requesterId = req.user.id;

    if (!teamId || !userId || !month || !year) {
      return res.status(400).json({ error: 'teamId, userId, month, year are required.' });
    }
    const tm = await isTeamMember(teamId, requesterId);
    if (!tm) return res.status(403).json({ error: 'Forbidden' });

    const { isOwnerAdmin, isManager } = await getRoleFlags(teamId, requesterId);

    let allowed = false;
    if (isOwnerAdmin) {
      allowed = true;
    } else if (isManager) {
      const reps = await repIdsUnderManager(teamId, requesterId);
      if (Number(userId) === Number(requesterId) || reps.includes(Number(userId))) {
        allowed = true;
      }
    } else {
      // sales rep
      if (Number(userId) === Number(requesterId)) allowed = true;
    }
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const [row, created] = await Targets.findOrCreate({
      where: { teamId, userId, month, year },
      defaults: { targetValue: Number(targetValue||0), targetUnits: Number(targetUnits||0) },
    });
    if (!created) {
      row.targetValue = Number(targetValue||0);
      row.targetUnits = Number(targetUnits||0);
      await row.save();
    }
    res.json({
      id: row.id, teamId, userId, month, year,
      targetValue: row.targetValue, targetUnits: row.targetUnits, created
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save target.', details: e.message });
  }
};

exports.deleteTarget = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const requesterId = req.user.id;

    const row = await Targets.findByPk(id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const tm = await isTeamMember(row.teamId, requesterId);
    if (!tm) return res.status(403).json({ error: 'Forbidden' });

    const { isOwnerAdmin, isManager } = await getRoleFlags(row.teamId, requesterId);
    let allowed = false;
    if (isOwnerAdmin) {
      allowed = true;
    } else if (isManager) {
      const reps = await repIdsUnderManager(row.teamId, requesterId);
      if (Number(row.userId) === Number(requesterId) || reps.includes(Number(row.userId))) {
        allowed = true;
      }
    } else {
      if (Number(row.userId) === Number(requesterId)) allowed = true;
    }
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    await row.destroy();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete target.', details: e.message });
  }
};
