const { Activities, LeadHistory, Tasks, FollowUpAttempts, TeamMembers } = require('@suites/database-models');

exports.getTimeline = async (req, res) => {
  const { id: opportunityId } = req.params;
  const { teamId } = req.query;
  const userId = req.user.id;

  try {
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const [acts, hist, tasks, attempts] = await Promise.all([
      Activities.findAll({ where: { teamId, opportunityId } }),
      LeadHistory.findAll({ where: { opportunityId } }),
      Tasks.findAll({ where: { teamId, opportunityId } }),
      FollowUpAttempts.findAll({ where: { teamId, opportunityId } }),
    ]);

    const items = [
      ...acts.map(a => ({ kind: 'ACTIVITY', at: a.completedAt || a.scheduledAt || a.createdAt, data: a })),
      ...hist.map(h => ({ kind: h.type, at: h.createdAt, data: h })),
      ...tasks.map(t => ({ kind: 'TASK', at: t.dueAt || t.createdAt, data: t })),
      ...attempts.map(f => ({ kind: 'FOLLOWUP_ATTEMPT', at: f.createdAt, data: f })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch timeline.', details: e.message });
  }
};
