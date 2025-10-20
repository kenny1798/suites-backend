// salestrack-service/controllers/opportunities.controller.js

const {
    Opportunities,
    TeamMembers,
    Contacts,
    OpportunityStatuses,
    LeadHistory,
    Users,
    sequelize
  } = require('@suites/database-models');
  const { Op } = require('sequelize');
  
  /**
   * Cipta satu opportunity baru untuk seorang contact.
   */
  exports.createOpportunity = async (req, res) => {
    const { name, value, contactId, teamId } = req.body;
    const userId = req.user.id;
  
    const t = await sequelize.transaction();
  
    try {
      // 1. Semak jika pengguna adalah ahli pasukan
      const membership = await TeamMembers.findOne({ where: { userId, teamId } });
      if (!membership) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden: You are not a member of this team.' });
      }
  
      // 2. Semak jika contact yang diberi wujud dalam team yang sama
      const contact = await Contacts.findOne({ where: { id: contactId, teamId } });
      if (!contact) {
        await t.rollback();
        return res.status(404).json({ error: 'Contact not found in the specified team.' });
      }
  
      // 3. Cari status permulaan (default) untuk pasukan ini
      const defaultStatus = await OpportunityStatuses.findOne({
        where: { teamId },
        order: [['order', 'ASC']],
      });
      if (!defaultStatus) {
        await t.rollback();
        return res.status(400).json({ error: 'This team has no sales pipeline configured. Please set up statuses in team settings.' });
      }
  
      // 4. Cipta opportunity baru
      const newOpportunity = await Opportunities.create({
        name,
        value: value || 0,
        contactId,
        teamId,
        userId,
        statusId: defaultStatus.id,
      }, { transaction: t });
  
      // 5. Cipta rekod sejarah pertama
      await LeadHistory.create({
        type: 'OPP_CREATED',
        details: { name: newOpportunity.name, createdBy: req.user.name },
        opportunityId: newOpportunity.id,
        userId: userId,
        teamId: teamId
      }, { transaction: t });
  
      await t.commit();
      res.status(201).json(newOpportunity);
  
    } catch (error) {
      await t.rollback();
      res.status(500).json({ error: 'Failed to create opportunity.', details: error.message });
    }
  };
  
  /**
   * Dapatkan senarai opportunity berdasarkan team dan role pengguna.
   */
  exports.getOpportunities = async (req, res) => {
    try {
      const userId = req.user.id;
      const { teamId, scope = 'active' } = req.query;
  
      if (!teamId) {
        return res.status(400).json({ error: 'teamId query parameter is required.' });
      }
  
      // Pastikan user memang ahli team
      const membership = await TeamMembers.findOne({ where: { userId, teamId } });
      if (!membership) {
        return res.status(403).json({ error: 'Forbidden: You are not a member of this team.' });
      }
  
      // Tapis ikut team + owner (userId) SAHAJA — regardless of role
      const paranoid = String(scope).toLowerCase() !== 'deleted';
      const where = { teamId, userId };
      if (!paranoid) where.deletedAt = { [Op.ne]: null }; // hanya yg deleted

      const opportunities = await Opportunities.findAll({
      where,
      paranoid, // penting untuk nampak soft-deleted
        include: [
          { model: Contacts, attributes: ['id', 'name', 'phone', 'phonecc'] },
          { model: Users, as: 'Owner', attributes: ['id', 'name'] },
          { model: OpportunityStatuses, attributes: ['id', 'name', 'category', 'color'] },
        ],
        order: [['createdAt', 'DESC']],
      });
  
      return res.json(opportunities);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch opportunities.', details: error.message });
    }
  };

  exports.updateOpportunity = async (req, res) => {
    const { id } = req.params;
    const { teamId, ...patch } = req.body;
    const userId = req.user.id;
  
    const t = await sequelize.transaction();
    try {
      const membership = await TeamMembers.findOne({ where: { userId, teamId }, transaction: t });
      if (!membership) { await t.rollback(); return res.status(403).json({ error: 'Forbidden' }); }
  
      const opp = await Opportunities.findOne({ where: { id, teamId }, transaction: t, lock: t.LOCK.UPDATE });
      if (!opp) { await t.rollback(); return res.status(404).json({ error: 'Opportunity not found.' }); }
  
      const before = opp.toJSON();
      await opp.update(patch, { transaction: t });
  
      // follow-up attempt detector (remark / nextFollowUpAt)
      const diffs = {};
      if (patch.remark != null && patch.remark !== before.remark) diffs.remarkChanged = true;
      if (patch.nextFollowUpAt != null && String(patch.nextFollowUpAt) !== String(before.nextFollowUpAt)) diffs.nextFollowUpChanged = true;
  
      if (diffs.remarkChanged || diffs.nextFollowUpChanged) {
        const { FollowUpAttempts } = require('@suites/database-models');
        if (diffs.remarkChanged) await FollowUpAttempts.create({ opportunityId: opp.id, byUserId: userId, teamId, cause: 'remark_change' }, { transaction: t });
        if (diffs.nextFollowUpChanged) await FollowUpAttempts.create({ opportunityId: opp.id, byUserId: userId, teamId, cause: 'next_followup_change' }, { transaction: t });
      }
  
      // history (VALUE_CHANGE ringkas)
      await LeadHistory.create({
        type: 'VALUE_CHANGE',
        opportunityId: opp.id,
        userId,
        details: { patch },
      }, { transaction: t });
  
      await t.commit();
      return res.json(opp);
    } catch (e) {
      await t.rollback();
      console.error('[updateOpportunity]', e);
      return res.status(500).json({ error: 'Failed to update opportunity.' });
    }
  };
  
  exports.moveOpportunity = async (req, res) => {
    const { id } = req.params;
    const { teamId, toStatusId, lostReason } = req.body;
    const userId = req.user.id;
  
    const t = await sequelize.transaction();
    try {
      const membership = await TeamMembers.findOne({ where: { userId, teamId }, transaction: t });
      if (!membership) { await t.rollback(); return res.status(403).json({ error: 'Forbidden' }); }
  
      const opp = await Opportunities.findOne({ where: { id, teamId }, transaction: t, lock: t.LOCK.UPDATE });
      if (!opp) { await t.rollback(); return res.status(404).json({ error: 'Opportunity not found.' }); }
  
      const [fromStatus, toStatus] = await Promise.all([
        opp.statusId ? OpportunityStatuses.findByPk(opp.statusId, { transaction: t }) : null,
        OpportunityStatuses.findOne({ where: { id: toStatusId, teamId }, transaction: t })
      ]);
      if (!toStatus) { await t.rollback(); return res.status(400).json({ error: 'Invalid status.' }); }
  
      await opp.update({
        statusId: toStatus.id,
        closedAt: toStatus.category === 'Outcome' ? new Date() : null,
        lostReason: (toStatus.category === 'Outcome' && toStatus.name.toLowerCase().includes('lost')) ? (lostReason || null) : null,
      }, { transaction: t });
  
      // NOTE: dashboard kau sekarang expect details { fromStatusId, toStatusId }
      // simpan kedua-dua bentuk agar backward/forward compatible
      await LeadHistory.create({
        type: 'STATUS_CHANGE',
        opportunityId: opp.id,
        userId,
        details: {
          fromStatusId: fromStatus?.id || null,
          toStatusId: toStatus.id,
          from: fromStatus ? { id: fromStatus.id, name: fromStatus.name } : null,
          to: { id: toStatus.id, name: toStatus.name }
        },
      }, { transaction: t });
  
      await t.commit();
      return res.json(opp);
    } catch (e) {
      await t.rollback();
      console.error('[moveOpportunity]', e);
      return res.status(500).json({ error: 'Failed to move opportunity.' });
    }
  };
  
  exports.assignOpportunity = async (req, res) => {
    const { id } = req.params;
    const { teamId, toUserId } = req.body;
    const actorId = req.user.id;
    
  
    const t = await sequelize.transaction();
    try {
      const membership = await TeamMembers.findOne({ where: { userId: actorId, teamId }, transaction: t });
      if (!membership) { await t.rollback(); return res.status(403).json({ error: 'Forbidden' }); }
  
      const [opp, target] = await Promise.all([
        Opportunities.findOne({ where: { id, teamId }, transaction: t, lock: t.LOCK.UPDATE }),
        TeamMembers.findOne({ where: { teamId, userId: toUserId }, transaction: t })
      ]);
      if (!opp) { await t.rollback(); return res.status(404).json({ error: 'Opportunity not found.' }); }
      if (!target) { await t.rollback(); return res.status(400).json({ error: 'Assignee is not a member of this team.' }); }
  
      const beforeUserId = opp.userId;
      await opp.update({ userId: toUserId }, { transaction: t });
  
      await LeadHistory.create({
        type: 'OWNER_CHANGE',
        opportunityId: opp.id,
        userId: actorId,
        details: { fromUserId: beforeUserId, toUserId },
      }, { transaction: t });
  
      await t.commit();
      return res.json(opp);
    } catch (e) {
      await t.rollback();
      console.error('[assignOpportunity]', e);
      return res.status(500).json({ error: 'Failed to assign opportunity.' });
    }
  };

  exports.deleteOpportunity = async (req, res) => {
    const { id } = req.params;
    const { teamId } = req.body; // axios DELETE hantar dalam body
    const userId = req.user.id;
  
    if (!teamId) return res.status(400).json({ error: 'teamId is required.' });
  
    const t = await sequelize.transaction();
    try {
      // mesti ahli team
      const membership = await TeamMembers.findOne({ where: { userId, teamId }, transaction: t });
      if (!membership) { await t.rollback(); return res.status(403).json({ error: 'Forbidden' }); }
  
      const opp = await Opportunities.findOne({ where: { id, teamId }, transaction: t, lock: t.LOCK.UPDATE });
      if (!opp) { await t.rollback(); return res.status(404).json({ error: 'Opportunity not found.' }); }
  
      // simple ownership guard (boleh longgarkan kalau admin/manager dibenarkan)
      if (opp.userId !== userId) {
        // comment line bawah jika admin/manager pun boleh delete
        await t.rollback();
        return res.status(403).json({ error: 'Only the owner can delete this opportunity.' });
      }
  
      await opp.destroy({ transaction: t }); // paranoid: true -> soft delete
  
      // optional: history log
      await LeadHistory.create({
        type: 'OPP_DELETED',
        opportunityId: opp.id,
        userId,
        teamId,
        details: { name: opp.name },
      }, { transaction: t });
  
      await t.commit();
      return res.json({ ok: true });
    } catch (e) {
      await t.rollback();
      console.error('[deleteOpportunity]', e);
      return res.status(500).json({ error: 'Failed to delete opportunity.' });
    }
  };

  // controllers/opportunities.controller.js
exports.deleteTimelineItem = async (req, res) => {
  const { id: opportunityId, kind } = req.params;
  const rowId = Number(req.params.rowId);
  const { teamId } = req.body; // axios.delete(url, { data: { teamId } })
  const userId = req.user.id;

  if (!teamId) return res.status(400).json({ error: 'teamId is required.' });
  if (!Number.isFinite(rowId)) return res.status(400).json({ error: 'Invalid timeline item id.' });

  const t = await sequelize.transaction();
  try {
    // mesti ahli team
    const membership = await TeamMembers.findOne({ where: { userId, teamId }, transaction: t });
    if (!membership) { await t.rollback(); return res.status(403).json({ error: 'Forbidden' }); }

    // pastikan opp memang dalam team
    const opp = await Opportunities.findOne({ where: { id: opportunityId, teamId }, transaction: t });
    if (!opp) { await t.rollback(); return res.status(404).json({ error: 'Opportunity not found.' }); }

    // normalize kind
    const K = String(kind || '').toUpperCase();

    let deleted = 0;

    if (['STATUS_CHANGE', 'OPP_CREATED', 'OWNER_CHANGE', 'VALUE_CHANGE', 'NOTE', 'FOLLOWUP_ATTEMPT'].includes(K)) {
      const { LeadHistory } = require('@suites/database-models');
      // ❗ JANGAN tapis teamId di sini sebab st_lead_history tak ada teamId
      deleted = await LeadHistory.destroy({
        where: { id: rowId, opportunityId },
        transaction: t,
      });
      if (!deleted) { await t.rollback(); return res.status(404).json({ error: 'Timeline item not found.' }); }

    } else if (K === 'ACTIVITY') {
      const { Activities } = require('@suites/database-models');
      // Activities biasanya ada opportunityId; teamId optional — kalau column wujud, boleh kekalkan
      deleted = await Activities.destroy({
        where: { id: rowId, opportunityId },
        transaction: t,
      });
      if (!deleted) { await t.rollback(); return res.status(404).json({ error: 'Activity not found.' }); }

    } else if (K === 'TASK') {
      const { Tasks } = require('@suites/database-models');
      // Tasks ada teamId; kekalkan tapis teamId untuk keselamatan
      deleted = await Tasks.destroy({
        where: { id: rowId, teamId },
        transaction: t,
      });
      if (!deleted) { await t.rollback(); return res.status(404).json({ error: 'Task not found.' }); }

    } else {
      await t.rollback();
      return res.status(400).json({ error: `Unsupported kind: ${K}` });
    }

    await t.commit();
    return res.json({ ok: true });
  } catch (e) {
    await t.rollback();
    console.error('[deleteTimelineItem]', e);
    return res.status(500).json({ error: 'Failed to delete timeline item.' });
  }
};

// GET /api/salestrack/opportunities/deleted?teamId=...
exports.getDeletedOpportunities = async (req, res) => {
  try {
    const userId = req.user.id;
    const { teamId } = req.query;
    if (!teamId) return res.status(400).json({ error: 'teamId query parameter is required.' });

    const membership = await TeamMembers.findOne({ where: { userId, teamId } });
    if (!membership) return res.status(403).json({ error: 'Forbidden' });

    const rows = await Opportunities.findAll({
      where: { teamId, userId, deletedAt: { [Op.ne]: null } },
      paranoid: false,
      include: [
        { model: Contacts, attributes: ['id', 'name', 'phone', 'phonecc'] },
        { model: Users, as: 'Owner', attributes: ['id', 'name'] },
        { model: OpportunityStatuses, attributes: ['id', 'name', 'category', 'color'] },
      ],
      order: [['deletedAt', 'DESC']],
    });

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch deleted opportunities.', details: e.message });
  }
};

// POST /api/salestrack/opportunities/:id/restore
exports.restoreOpportunity = async (req, res) => {
  const { id } = req.params;
  const { teamId } = req.body;
  const userId = req.user.id;

  if (!teamId) return res.status(400).json({ error: 'teamId is required.' });

  const t = await sequelize.transaction();
  try {
    const membership = await TeamMembers.findOne({ where: { userId, teamId }, transaction: t });
    if (!membership) { await t.rollback(); return res.status(403).json({ error: 'Forbidden' }); }

    const opp = await Opportunities.findOne({
      where: { id, teamId, userId },
      paranoid: false,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!opp) { await t.rollback(); return res.status(404).json({ error: 'Opportunity not found.' }); }
    if (!opp.deletedAt) { await t.rollback(); return res.status(400).json({ error: 'Opportunity is not deleted.' }); }

    await opp.restore({ transaction: t });

    await LeadHistory.create({
      type: 'OPP_RESTORED',
      opportunityId: opp.id,
      userId,
      details: { name: opp.name },
    }, { transaction: t });

    await t.commit();
    return res.json(opp);
  } catch (e) {
    await t.rollback();
    return res.status(500).json({ error: 'Failed to restore opportunity.', details: e.message });
  }
};


  