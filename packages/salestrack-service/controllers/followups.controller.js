const { FollowUpAttempts, TeamMembers, LeadHistory, Opportunities, OpportunityStatuses } = require('@suites/database-models');
const { Op, fn, col } = require('sequelize');

exports.summary = async (req, res) => {
  const { teamId, from, to, scope = 'mine', userId } = req.query;
  const viewer = req.user.id;

  try {
    const membership = await TeamMembers.findOne({ where: { userId: viewer, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const start = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to ? new Date(to) : new Date();

    const where = { teamId, createdAt: { [Op.between]: [start, end] } };
    if (scope === 'mine') where.byUserId = viewer;
    else if (userId) where.byUserId = Number(userId);

    const attempts = await FollowUpAttempts.findAll({ where });

    // simple group by user/date
    const byUser = {};
    const byDate = {};
    attempts.forEach(a => {
      byUser[a.byUserId] = (byUser[a.byUserId] || 0) + 1;
      const d = a.createdAt.toISOString().slice(0,10);
      byDate[d] = (byDate[d] || 0) + 1;
    });

    res.json({
      range: { from: start.toISOString().slice(0,10), to: end.toISOString().slice(0,10) },
      byUser: Object.entries(byUser).map(([uid, attempts]) => ({ userId: Number(uid), attempts, converts: 0, overdue: 0 })),
      byDate: Object.entries(byDate).map(([date, attempts]) => ({ date, attempts, converts: 0 })),
      totals: { attempts: attempts.length, converts: 0, overdue: 0 }
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch followups summary.', details: e.message });
  }
};
