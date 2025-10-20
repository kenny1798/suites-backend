// salestrack-service/controllers/teams.controller.js

const { Teams, TeamMembers, Users, ToolSubscription, Plan, sequelize, OpportunityStatuses } = require('@suites/database-models');

const CAT_ORDER = ['Prospect', 'Deal', 'Outcome', 'Ongoing'];

function isValidHexColor(x) {
  return x == null || x === '' || /^#[0-9A-Fa-f]{6}$/.test(String(x));
}

// 🔧 normalize: support OBJECT (baru) atau ARRAY (legacy)
function normalizeStatusesPayload(body) {
  // legacy array flat
  if (Array.isArray(body)) {
    return body
      .map(s => ({
        name: String(s?.name || '').trim(),
        category: CAT_ORDER.includes(s?.category) ? s.category : 'Prospect',
        color: s?.color ?? null,
        order: Number.isFinite(s?.order) ? s.order : 0,
      }))
      .filter(x => x.name);
  }

  // object { Prospect:[], Deal:[], ... }
  let acc = 1;
  const out = [];
  CAT_ORDER.forEach(cat => {
    const arr = Array.isArray(body?.[cat]) ? body[cat] : [];
    arr.forEach(s => {
      const name = String(s?.name || '').trim();
      if (!name) return;
      out.push({
        name,
        category: cat,
        color: s?.color ?? null,
        order: Number.isFinite(s?.order) ? s.order : acc++,
      });
    });
  });
  return out;
}

// helper kecil (kalau belum ada)
async function getRole(userId, teamId) {
  const m = await TeamMembers.findOne({ where: { userId, teamId } });
  return m?.role || null;
}


/**
 * Cipta satu pasukan baru.
 * Pengguna yang mencipta akan secara automatik jadi OWNER.
 */
exports.createTeam = async (req, res) => {
  const { name } = req.body;
  const userId = req.user.id;

  const t = await sequelize.transaction();

  try {
    if (!name) {
      return res.status(400).json({ error: 'Team name is required.' });
    }

    // 1. Cipta pasukan dalam table Teams
    const newTeam = await Teams.create({
      name,
      ownerId: userId,
    }, { transaction: t });

    // 2. Tambah pengguna sebagai OWNER dalam table TeamMembers
    await TeamMembers.create({
      teamId: newTeam.id,
      userId: userId,
      role: 'OWNER',
    }, { transaction: t });

    // Jika semua berjaya, commit transaction
    await t.commit();

    res.status(201).json(newTeam);
  } catch (error) {
    // Jika ada sebarang ralat, batalkan semua operasi
    await t.rollback();
    res.status(500).json({ error: 'Failed to create team.', details: error.message });
  }
};

/**
 * Dapatkan senarai semua pasukan di mana pengguna adalah ahli.
 */
exports.getMyTeams = async (req, res) => {
  try {
    const userId = req.user.id;

    // Cari semua pasukan yang ada userId ni dalam TeamMembers
    const teams = await Teams.findAll({
      include: [{
        model: TeamMembers,
        where: { userId: userId },
        required: true, // Guna INNER JOIN, hanya pulangkan Team jika ada membership
      }],
      order: [['name', 'ASC']],
    });

    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch teams.', details: error.message });
  }
};

/**
 * Jemput pengguna baru ke dalam pasukan.
 * Ada sekatan untuk pelan individu & had tempat duduk (seats).
 */
exports.inviteMember = async (req, res) => {
  const { teamId } = req.params;
  const { email, role } = req.body;

  try {
    // --- SEKATAN BARU BERMULA DI SINI ---

    // 1. Dapatkan maklumat pasukan untuk tahu siapa pemiliknya
    const team = await Teams.findByPk(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    // 2. Cari langganan SalesTrack milik OWNER pasukan ni
    const ownerSubscription = await ToolSubscription.findOne({
      where: {
        userId: team.ownerId,
        toolId: 'salestrack', // Spesifik untuk tool SalesTrack
        status: ['active', 'trialing'], // Pastikan langganan masih sah
      },
    });

    if (!ownerSubscription) {
      return res.status(403).json({ error: 'Subscription for this tool is not active.' });
    }

    // 3. Dapatkan butiran penuh pelan untuk tahu had 'seats'
    const ownerPlan = await Plan.findOne({ where: { code: ownerSubscription.planCode } });
    if (!ownerPlan) {
      return res.status(404).json({ error: 'Subscription plan details not found.' });
    }

    // 4. LAKSANAAN SEKATAN: Semak jika pelan adalah individu
    if (ownerPlan.code.includes('INDIVIDUAL')) {
      return res.status(403).json({ error: 'Your current plan does not support inviting team members.' });
    }

    // 5. LAKSANAAN SEKATAN: Semak had tempat duduk (seats)
    if (ownerPlan.seats) { // Jika 'seats' ada had (bukan NULL)
      const currentMemberCount = await TeamMembers.count({ where: { teamId } });
      if (currentMemberCount >= ownerPlan.seats) {
        return res.status(403).json({ error: `You have reached the maximum of ${ownerPlan.seats} members for your current plan.` });
      }
    }

    // --- SEKATAN TAMAT ---


    // ... (Logik jemputan yang sedia ada diteruskan jika semua sekatan lepas) ...
    const userToInvite = await Users.findOne({ where: { email } });
    if (!userToInvite) {
      return res.status(404).json({ error: 'User with this email not found. Please ask them to register first.' });
    }

    const isAlreadyMember = await TeamMembers.findOne({ where: { teamId, userId: userToInvite.id } });
    if (isAlreadyMember) {
      return res.status(409).json({ error: 'User is already a member of this team.' });
    }
    
    const newMember = await TeamMembers.create({ teamId, userId: userToInvite.id, role });

    res.status(201).json(newMember);
  } catch (error) {
    res.status(500).json({ error: 'Failed to invite member.', details: error.message });
    console.error(error);
  }
};

/**
 * Dapatkan senarai semua ahli dalam satu pasukan.
 */
exports.listMembers = async (req, res) => {
  const { teamId } = req.params;

  try {
    const members = await TeamMembers.findAll({
      where: { teamId },
      include: [{
        model: Users,
        attributes: { exclude: ['password'] }
      }],
      order: [['createdAt', 'ASC']],
    });

    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch team members.', details: error.message });
  }
};

// GET /api/salestrack/teams/:teamId  (fetch single team)
exports.getTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await Teams.findByPk(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found.' });
    res.json(team);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch team.', details: e.message });
  }
};

// PUT /api/salestrack/teams/:teamId  (rename)
exports.updateTeam = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { teamId } = req.params;
    const { name } = req.body;
    if (!name?.trim()) {
      await t.rollback();
      return res.status(400).json({ error: 'Team name is required.' });
    }
    const team = await Teams.findByPk(teamId, { transaction: t });
    if (!team) {
      await t.rollback();
      return res.status(404).json({ error: 'Team not found.' });
    }
    team.name = name.trim();
    await team.save({ transaction: t });
    await t.commit();
    res.json(team);
  } catch (e) {
    await t.rollback();
    res.status(500).json({ error: 'Failed to update team.', details: e.message });
  }
};

// (optional) default statuses — align category baru
exports.createDefaultStatuses = async (req, res) => {
  const { teamId } = req.params;
  try {
    const defaults = [
      { name: 'New Lead', order: 1, category: 'Prospect', teamId },
      { name: 'Contacted', order: 2, category: 'Prospect', teamId },
      { name: 'Proposal Sent', order: 3, category: 'Deal', teamId },
      { name: 'Won', order: 4, category: 'Outcome', teamId, color: '#16a34a' },
      { name: 'Lost', order: 5, category: 'Outcome', teamId, color: '#dc2626' },
      { name: 'Repeat Customer', order: 6, category: 'Ongoing', teamId },
    ];
    await OpportunityStatuses.bulkCreate(defaults);
    res.status(201).json({ message: 'Default statuses created.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create defaults.', details: error.message });
  }
};

// GET /api/salestrack/teams/:teamId/statuses
exports.getTeamStatuses = async (req, res) => {
  const { teamId } = req.params;
  try {
    const rows = await OpportunityStatuses.findAll({
      where: { teamId },
      order: [['order', 'ASC']],
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statuses.' });
  }
};

// POST /api/salestrack/teams/:teamId/statuses (replace all)
// ✅ now accepts OBJECT or ARRAY
exports.bulkCreateOrUpdateStatuses = async (req, res) => {
  const { teamId } = req.params;
  const t = await sequelize.transaction();
  try {
    const flat = normalizeStatusesPayload(req.body);

    if (!Array.isArray(flat) || flat.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Statuses are required.' });
    }
    // validate
    for (const s of flat) {
      if (!CAT_ORDER.includes(s.category)) {
        await t.rollback();
        return res.status(400).json({ error: `Invalid category: ${s.category}` });
      }
      if (!isValidHexColor(s.color)) {
        await t.rollback();
        return res.status(400).json({ error: `Invalid color: ${s.color}` });
      }
    }

    await OpportunityStatuses.destroy({ where: { teamId }, transaction: t });
    const toCreate = flat.map(x => ({ ...x, teamId }));
    const rows = await OpportunityStatuses.bulkCreate(toCreate, { transaction: t });

    await t.commit();
    res.status(201).json(rows);
  } catch (error) {
    await t.rollback();
    res.status(500).json({ error: 'Failed to create/update statuses.', details: error.message });
  }
};

// POST /api/salestrack/teams/setup  (create team + pipeline)
exports.setupTeamWithPipeline = async (req, res) => {
  const { name } = req.body;
  const userId = req.user.id;
  const t = await sequelize.transaction();

  try {
    if (!name?.trim()) {
      await t.rollback();
      return res.status(400).json({ error: 'Team name is required.' });
    }

    const team = await Teams.create({ name: name.trim(), ownerId: userId }, { transaction: t });
    await TeamMembers.create({ teamId: team.id, userId, role: 'OWNER' }, { transaction: t });

    const flat = normalizeStatusesPayload(req.body);
    if (flat.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: 'At least one status is required.' });
    }
    for (const s of flat) {
      if (!CAT_ORDER.includes(s.category)) {
        await t.rollback();
        return res.status(400).json({ error: `Invalid category: ${s.category}` });
      }
      if (!isValidHexColor(s.color)) {
        await t.rollback();
        return res.status(400).json({ error: `Invalid color: ${s.color}` });
      }
    }

    await OpportunityStatuses.destroy({ where: { teamId: team.id }, transaction: t });
    const toCreate = flat.map(s => ({ ...s, teamId: team.id }));
    await OpportunityStatuses.bulkCreate(toCreate, { transaction: t });

    await t.commit();
    return res.status(201).json({ team, statuses: toCreate });
  } catch (error) {
    console.error(error);
    await t.rollback();
    return res.status(500).json({ error: 'Failed to setup team.', details: error.message });
  }
};

exports.listVisibleMembers = async (req, res) => {
  const { teamId } = req.params;
  const requesterId = req.user.id;

  try {
    const role = await getRole(requesterId, teamId);
    if (!role) return res.status(403).json({ error: 'Forbidden: not a member.' });

    // bentuk include untuk standardize response
    const includeUser = [{ model: Users, attributes: { exclude: ['password'] } }];

    if (role === 'OWNER' || role === 'ADMIN') {
      // semua ahli team
      const rows = await TeamMembers.findAll({
        where: { teamId },
        include: includeUser,
        order: [['role', 'ASC'], ['createdAt', 'ASC']],
      });
      return res.json({ scope: role, members: rows });
    }

    if (role === 'MANAGER') {
      // 1) diri sendiri
      const me = await TeamMembers.findOne({
        where: { teamId, userId: requesterId },
        include: includeUser,
      });

      // 2) reps bawah dia (TeamReporting → repUserId)
      const pairs = await TeamReporting.findAll({
        where: { teamId, managerUserId: requesterId },
        attributes: ['repUserId'],
      });
      const repIds = pairs.map(p => p.repUserId);
      let reps = [];
      if (repIds.length > 0) {
        reps = await TeamMembers.findAll({
          where: { teamId, userId: repIds }, // tak force role, tapi kebiasaannya SALES_REP
          include: includeUser,
          order: [['createdAt', 'ASC']],
        });
      }
      return res.json({ scope: 'MANAGER', members: [me, ...reps].filter(Boolean) });
    }

    // SALES_REP
    return res.status(403).json({ error: 'Forbidden: members page not allowed for this role.' });
  } catch (e) {
    console.error('[listVisibleMembers] failed:', e);
    return res.status(500).json({ error: 'Failed to fetch members.' });
  }
};