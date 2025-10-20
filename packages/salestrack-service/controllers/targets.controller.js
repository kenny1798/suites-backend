// salestrack-service/controllers/targets.roleview.controller.js
const { Op } = require('sequelize');
const {
  TeamMembers, TeamReporting, Targets, Users,
} = require('@suites/database-models');

/** helper */
const pickMY = (req) => ({
  teamId: Number(req.params.teamId),
  month:  Number(req.query.month),
  year:   Number(req.query.year),
  q:      (req.query.q || '').trim(),
});

function asDTO(row) {
  return {
    id: row.id,
    userId: row.userId,
    month: row.month,
    year: row.year,
    targetValue: Number(row.targetValue || 0),
    targetUnits: Number(row.targetUnits || 0),
    user: row.User ? { id: row.User.id, name: row.User.name, email: row.User.email } : null,
  };
}

/**
 * GET /teams/:teamId/targets/role-view?month&year&q
 * Pulangkan:
 * { role, me:{id,name,email}, sections:[ {key,title,rows:[{... , canEdit:true|false}]} ] }
 */
exports.roleView = async (req, res) => {
  const me = req.user;
  const { teamId, month, year, q } = pickMY(req);
  if (!teamId || !month || !year) return res.status(400).json({ error: 'teamId, month, year are required.' });

  // 1) sahkan ahli & role
  const membership = await TeamMembers.findOne({ where: { teamId, userId: me.id } });
  if (!membership) return res.status(403).json({ error: 'Forbidden' });
  const role = membership.role; // OWNER | ADMIN | MANAGER | SALES_REP

  // 2) build scope by role
  let sections = [];

  // SALES_REP — hanya diri sendiri (boleh edit)
  if (role === 'SALES_REP') {
    const row = await Targets.findOne({
      where: { teamId, userId: me.id, month, year },
      include: [{ model: Users, attributes: ['id','name','email'] }],
    });
    sections.push({
      key: 'self',
      title: 'My Target',
      rows: [asDTO(row || { teamId, userId: me.id, month, year, targetValue:0, targetUnits:0, User: me })]
        .map(r => ({ ...r, canEdit: true })),
    });
  }

  // MANAGER — self (editable) + reps bawah dia (read-only)
  if (role === 'MANAGER') {
    // self
    const self = await Targets.findOne({
      where: { teamId, userId: me.id, month, year },
      include: [{ model: Users, attributes: ['id','name','email'] }],
    });
    const selfRows = [asDTO(self || { teamId, userId: me.id, month, year, targetValue:0, targetUnits:0, User: me })]
      .map(r => ({ ...r, canEdit: true }));

    // reps bawah dia
    const links = await TeamReporting.findAll({ where: { teamId, managerUserId: me.id }, attributes:['repUserId'] });
    const repIds = links.map(x => x.repUserId);
    let repUsers = [];
    if (repIds.length) {
      repUsers = await Users.findAll({ where: { id: { [Op.in]: repIds }}, attributes: ['id','name','email'] });
    }
    // Cari targets utk semua rep
    const repTargets = await Targets.findAll({
      where: { teamId, userId: { [Op.in]: repIds }, month, year },
      include: [{ model: Users, attributes: ['id','name','email'] }],
    });
    // Pastikan semua rep appear walau tiada row target
    const repRows = repUsers.map(u => {
      const match = repTargets.find(t => t.userId === u.id);
      return asDTO(match || { teamId, userId: u.id, month, year, targetValue:0, targetUnits:0, User: u });
    }).map(r => ({ ...r, canEdit: false }));

    // search q apply pada kedua-dua set
    const matchQ = (row) => {
      if (!q) return true;
      const blob = `${row.user?.name||''} ${row.user?.email||''}`.toLowerCase();
      return blob.includes(q.toLowerCase());
    };

    sections.push({ key:'self', title:'My Target', rows: selfRows.filter(matchQ) });
    sections.push({ key:'team', title:'My Reps (read-only)', rows: repRows.filter(matchQ) });
  }

  // OWNER/ADMIN — semua ahli team (kecuali diri sendiri), read-only
  if (role === 'OWNER' || role === 'ADMIN') {
    // ambil semua users dalam team (dari TeamMembers) kecuali diri sendiri
    const memberRows = await TeamMembers.findAll({
      where: { teamId, userId: { [Op.ne]: me.id } },
      include: [{ model: Users, attributes: ['id','name','email'] }],
      attributes: ['userId'],
    });
    const userIds = memberRows.map(m => m.userId);
    const targets = await Targets.findAll({
      where: { teamId, userId: { [Op.in]: userIds }, month, year },
      include: [{ model: Users, attributes: ['id','name','email'] }],
    });

    const allRows = memberRows.map(m => {
      const u = m.User;
      const t = targets.find(x => x.userId === m.userId);
      return asDTO(t || { teamId, userId: m.userId, month, year, targetValue:0, targetUnits:0, User: u });
    }).map(r => ({ ...r, canEdit: false }));

    const list = !q ? allRows : allRows.filter(r => {
      const s = `${r.user?.name||''} ${r.user?.email||''}`.toLowerCase();
      return s.includes(q.toLowerCase());
    });

    sections.push({ key:'team', title:'Team Targets (read-only)', rows: list });
  }

  res.json({
    role,
    me: { id: me.id, name: me.name, email: me.email },
    sections,
  });
};

/**
 * PUT /teams/:teamId/targets/me
 * Sales Rep & Manager: boleh edit diri sendiri.
 * Owner/Admin: DILARANG.
 */
exports.upsertMyTarget = async (req, res) => {
  const me = req.user;
  const teamId = Number(req.params.teamId);
  const { month, year, targetValue = 0, targetUnits = 0 } = req.body || {};
  if (!teamId || !month || !year) return res.status(400).json({ error: 'teamId, month, year are required.' });

  const membership = await TeamMembers.findOne({ where: { teamId, userId: me.id } });
  if (!membership) return res.status(403).json({ error: 'Forbidden' });

  if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
    return res.status(403).json({ error: 'Owners/Admins cannot edit personal targets.' });
  }

  const [row] = await Targets.upsert({
    teamId, userId: me.id, month, year,
    targetValue: Number(targetValue||0),
    targetUnits: Number(targetUnits||0),
  });

  res.json({ ok:true, item: row });
};
