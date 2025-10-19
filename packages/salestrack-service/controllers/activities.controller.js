const { Activities, Opportunities, TeamMembers, FollowUpAttempts, LeadHistory, sequelize } = require('@suites/database-models');
const { Op } = require('sequelize');

exports.listActivities = async (req, res) => {
  const { id: opportunityId } = req.params;
  const { teamId, status } = req.query;
  const userId = req.user.id;

  try {
    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const where = { opportunityId, teamId };
    if (status) where.status = status;

    const items = await Activities.findAll({
      where,
      order: [['completedAt', 'DESC'], ['scheduledAt', 'DESC'], ['id', 'DESC']],
    });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch activities.', details: e.message });
  }
};

exports.createActivity = async (req, res) => {
  const { id: opportunityId } = req.params;
  const { teamId } = req.body; // pass teamId in body like others
  const userId = req.user.id;

  const t = await sequelize.transaction();
  try {
    const membership = await TeamMembers.findOne({ where: { userId, teamId }, transaction: t });
    if (!membership) { await t.rollback(); return res.status(403).json({ error: 'Forbidden' }); }

    const opp = await Opportunities.findOne({ where: { id: opportunityId, teamId }, transaction: t });
    if (!opp) { await t.rollback(); return res.status(404).json({ error: 'Opportunity not found.' }); }

    const act = await Activities.create({
      ...req.body,
      userId,
      opportunityId,
      teamId,
    }, { transaction: t });

    await Opportunities.update({ lastActivityAt: new Date() }, { where: { id: opportunityId }, transaction: t });

    await FollowUpAttempts.create({
      opportunityId,
      byUserId: userId,
      teamId,
      cause: 'activity',
      refActivityId: act.id,
    }, { transaction: t });

    await LeadHistory.create({
      type: 'NOTE',
      opportunityId,
      userId,
      details: { activityId: act.id, type: act.type, note: act.notes || null },
    }, { transaction: t });

    await t.commit();
    res.status(201).json(act);
  } catch (e) {
    await t.rollback();
    res.status(500).json({ error: 'Failed to create activity.', details: e.message });
  }
};
