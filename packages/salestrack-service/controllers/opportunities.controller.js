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
      const { teamId } = req.query;
  
      if (!teamId) {
        return res.status(400).json({ error: 'teamId query parameter is required.' });
      }
  
      // Pastikan user memang ahli team
      const membership = await TeamMembers.findOne({ where: { userId, teamId } });
      if (!membership) {
        return res.status(403).json({ error: 'Forbidden: You are not a member of this team.' });
      }
  
      // Tapis ikut team + owner (userId) SAHAJA — regardless of role
      const opportunities = await Opportunities.findAll({
        where: { teamId, userId }, // ⚠️ jika kolum owner lain (contoh: ownerId), tukar ke { teamId, ownerId: userId }
        include: [
          { model: Contacts, attributes: ['id', 'name'] },
          { model: Users, as: 'Owner', attributes: ['id', 'name'] },
          { model: OpportunityStatuses, attributes: ['id', 'name', 'category'] },
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