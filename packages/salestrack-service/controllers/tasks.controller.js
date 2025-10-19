const { Tasks, TeamMembers, Opportunities, Contacts } = require('@suites/database-models');
const { Op } = require('sequelize');

function dueRange(range) {
  const now = new Date();
  const start = new Date(now); start.setHours(0,0,0,0);
  const end = new Date(now); end.setHours(23,59,59,999);
  if (range === 'overdue') return { [Op.lt]: start };
  if (range === 'today') return { [Op.between]: [start, end] };
  if (range === 'week') { const e = new Date(end); e.setDate(e.getDate()+7); return { [Op.between]: [start, e] }; }
  if (range === 'upcoming') return { [Op.gt]: end };
  return undefined;
}

exports.listTasks = async (req, res) => {
  try {
    const { teamId, status = 'OPEN', range } = req.query;
    const userId = req.user.id;

    if (!teamId) {
      return res.status(400).json({ error: 'teamId query parameter is required.' });
    }

    // Pastikan ahli team
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    // Paksa hanya task ciptaan user ni sahaja
    const where = { teamId, createdBy: userId, status };

    const r = dueRange(range);
    if (r) where.dueAt = r;

    const items = await Tasks.findAll({
      where,
      order: [['dueAt', 'ASC'], ['id', 'ASC']],
    });

    return res.json({ items, total: items.length });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch tasks.', details: e.message });
  }
};

/**
 * GET /api/salestrack/tasks/filter
 * Query:
 *  teamId (req), status=ALL|OPEN|SNOOZED|DONE|CANCELLED|OVERDUE,
 *  type=ALL|FOLLOWUP|CALL|EMAIL|MEETING|WHATSAPP, range=today|overdue|...
 *
 * Nota: sentiasa tapis createdBy = user login (ignore scope/assigneeId)
 */
exports.filterTasks = async (req, res) => {
  try {
    const { teamId, status, type, range } = req.query;
    const userId = req.user.id;

    if (!teamId) {
      return res.status(400).json({ error: 'teamId query parameter is required.' });
    }

    // Pastikan ahli team
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    // Paksa hanya task ciptaan user ni sahaja
    const where = { teamId, createdBy: userId };
    if (status && status !== 'ALL') where.status = String(status).toUpperCase();
    if (type && type !== 'ALL') where.type = String(type).toUpperCase();

    const r = dueRange(range);
    if (r) where.dueAt = r;

    const items = await Tasks.findAll({
      where,
      order: [['dueAt', 'ASC'], ['id', 'ASC']],
      include: [
        {
          model: Opportunities,
          as: 'Opportunity',
          attributes: ['id', 'name'],
          required: false,
          include: [
            { model: Contacts, as: 'Contact', attributes: ['id', 'name'], required: false }
          ]
        }
      ],
    });

    return res.json({ items, total: items.length });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch tasks.', details: e.message });
  }
};

exports.createTaskForOpportunity = async (req, res) => {
  const { id: opportunityId } = req.params;
  const { teamId, assigneeId, type = 'FOLLOWUP', note, dueAt } = req.body;
  const userId = req.user.id;

  try {
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const row = await Tasks.create({
      opportunityId, assigneeId, type, note: note || null,
      dueAt, status: 'OPEN', createdBy: userId, teamId
    });

    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create task.', details: e.message });
  }
};

exports.patchTask = async (req, res) => {
  const { id } = req.params;
  const { teamId, status, snoozeUntil, completedAt, note } = req.body;
  const userId = req.user.id;

  try {
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const row = await Tasks.findOne({ where: { id, teamId } });
    if (!row) return res.status(404).json({ error: 'Task not found.' });

    const patch = {};
    if (status) patch.status = status;
    if (snoozeUntil !== undefined) patch.snoozeUntil = snoozeUntil;
    if (completedAt !== undefined) patch.completedAt = completedAt;
    if (note !== undefined) patch.note = note;

    await row.update(patch);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update task.', details: e.message });
  }
};
