const {
    Teams, TeamMembers, Users, TeamJoinRequests, TeamReporting, sequelize,
  } = require('@suites/database-models');
  const { verifyHashedTeamName } = require('../utils/teamLink');
  const { hashTeamName } = require('../utils/teamLink');


  
  // ----- helpers/permissions -----
  function canApprove(role) {
    return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
  }
  function canManageMembers(role) {
    return role === 'OWNER' || role === 'ADMIN';
  }
  async function getRole(userId, teamId) {
    const m = await TeamMembers.findOne({ where: { userId, teamId } });
    return m?.role || null;
  }
  
  // ---------- PUBLIC: resolve link ----------
  exports.resolveInviteLink = async (req, res) => {
    const { teamId, hash, pos, inviterId } = req.params;
    
    try {
      const team = await Teams.findByPk(teamId);
      const { hashTeamName } = require('../utils/teamLink');
      console.log('[resolveInviteLink]', {
      team: team.name,
      givenHash: hash,
      expected: hashTeamName(team),
      pos, inviterId
      });
      if (!team) return res.status(404).json({ error: 'Team not found.' });
      if (!verifyHashedTeamName(team, hash)) return res.status(404).json({ error: 'Invalid link.' });
  
      const inviter = await Users.findByPk(inviterId, { attributes: ['id', 'name', 'email'] });
      if (!inviter) return res.status(404).json({ error: 'Inviter not found.' });
  
      const requestedRole = (pos || 'SALES_REP').toUpperCase();
      const allow = ['ADMIN', 'MANAGER', 'SALES_REP'];
      res.json({
        team: { id: team.id, name: team.name },
        inviter,
        requestedRole: allow.includes(requestedRole) ? requestedRole : 'SALES_REP',
      });
    } catch (e) {
      console.error('[resolveInviteLink]', e);
      res.status(500).json({ error: 'Failed to resolve invitation link.' });
    }
  };
  
  // ---------- AUTH: request to join ----------
  exports.requestJoin = async (req, res) => {
    const { teamId, hash, pos, inviterId } = req.params;
    const requesterId = req.user.id;
  
    const t = await sequelize.transaction();
    try {
      const team = await Teams.findByPk(teamId, { transaction: t });
      if (!team || !verifyHashedTeamName(team, hash)) {
        await t.rollback();
        return res.status(404).json({ error: 'Invalid invite link.' });
      }
  
      // requester already member?
      const exist = await TeamMembers.findOne({ where: { teamId, userId: requesterId }, transaction: t });
      if (exist) {
        await t.rollback();
        return res.status(409).json({ error: 'You are already a member of this team.' });
      }
  
      // inviter must be a member
      const inviterMembership = await TeamMembers.findOne({ where: { teamId, userId: inviterId }, transaction: t });
      if (!inviterMembership) {
        await t.rollback();
        return res.status(400).json({ error: 'Inviter is not a member of this team.' });
      }
  
      const requestedRole = (pos || 'SALES_REP').toUpperCase();
      if (!['ADMIN', 'MANAGER', 'SALES_REP'].includes(requestedRole)) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid requested role.' });
      }
  
      // prevent duplicate pending
      const pending = await TeamJoinRequests.findOne({
        where: { teamId, requesterId, status: 'PENDING' }, transaction: t,
      });
      if (pending) {
        await t.rollback();
        return res.status(409).json({ error: 'You already have a pending request.' });
      }
  
      const jr = await TeamJoinRequests.create({
        teamId, inviterId, requesterId, requestedRole, status: 'PENDING',
      }, { transaction: t });
  
      await t.commit();
      res.status(201).json({ request: jr });
    } catch (e) {
      console.error('[requestJoin]', e);
      await t.rollback();
      res.status(500).json({ error: 'Failed to create join request.' });
    }
  };
  
  // ---------- AUTH: list join requests ----------
  exports.listJoinRequests = async (req, res) => {
    const { teamId } = req.params;
    try {
      const role = await getRole(req.user.id, teamId);
      if (!role) return res.status(403).json({ error: 'Forbidden.' });
  
      const where =
        canManageMembers(role)
          ? { teamId, status: 'PENDING' }
          : role === 'MANAGER'
            ? { teamId, status: 'PENDING', inviterId: req.user.id }
            : null;
  
      if (!where) return res.status(403).json({ error: 'Forbidden.' });
  
      const rows = await TeamJoinRequests.findAll({
        where,
        order: [['createdAt', 'ASC']],
        include: [
          { model: Users, as: 'Requester', attributes: ['id', 'name', 'email'] },
          { model: Users, as: 'Inviter', attributes: ['id', 'name', 'email'] },
        ],
      });
      res.json(rows);
    } catch (e) {
      console.error('[listJoinRequests]', e);
      res.status(500).json({ error: 'Failed to fetch join requests.' });
    }
  };
  
  // ---------- AUTH: approve ----------
  exports.approveJoinRequest = async (req, res) => {
    const { teamId, id } = req.params;
    const approverId = req.user.id;
  
    const t = await sequelize.transaction();
    try {
      const role = await getRole(approverId, teamId);
      if (!role || !canApprove(role)) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden.' });
      }
  
      const jr = await TeamJoinRequests.findByPk(id, { transaction: t });
      if (!jr || jr.teamId !== Number(teamId)) {
        await t.rollback();
        return res.status(404).json({ error: 'Request not found.' });
      }
      if (role === 'MANAGER' && jr.inviterId !== approverId) {
        await t.rollback();
        return res.status(403).json({ error: 'Managers can only approve their own invited requests.' });
      }
      if (jr.status !== 'PENDING') {
        await t.rollback();
        return res.status(400).json({ error: 'Request is not pending.' });
      }
  
      // add membership
      await TeamMembers.create({
        teamId: jr.teamId,
        userId: jr.requesterId,
        role: jr.requestedRole,
      }, { transaction: t });
  
      // create reporting if manager invited a SALES_REP
      if (jr.requestedRole === 'SALES_REP') {
        const inviterM = await TeamMembers.findOne({
          where: { teamId: jr.teamId, userId: jr.inviterId },
          transaction: t,
        });
        if (inviterM?.role === 'MANAGER') {
          await TeamReporting.findOrCreate({
            where: { teamId: jr.teamId, managerUserId: jr.inviterId, repUserId: jr.requesterId },
            defaults: { teamId: jr.teamId, managerUserId: jr.inviterId, repUserId: jr.requesterId },
            transaction: t,
          });
        }
      }
  
      await jr.update({ status: 'APPROVED', approvedBy: approverId }, { transaction: t });
      await t.commit();
      res.json({ message: 'Approved.' });
    } catch (e) {
      console.error('[approveJoinRequest]', e);
      await t.rollback();
      res.status(500).json({ error: 'Failed to approve request.' });
    }
  };
  
  // ---------- AUTH: reject ----------
  exports.rejectJoinRequest = async (req, res) => {
    const { teamId, id } = req.params;
    const userId = req.user.id;
  
    try {
      const role = await getRole(userId, teamId);
      if (!role || !canApprove(role)) return res.status(403).json({ error: 'Forbidden.' });
  
      const jr = await TeamJoinRequests.findByPk(id);
      if (!jr || jr.teamId !== Number(teamId)) return res.status(404).json({ error: 'Request not found.' });
      if (role === 'MANAGER' && jr.inviterId !== userId) return res.status(403).json({ error: 'Forbidden.' });
      if (jr.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending.' });
  
      await jr.update({ status: 'REJECTED', approvedBy: userId });
      res.json({ message: 'Rejected.' });
    } catch (e) {
      console.error('[rejectJoinRequest]', e);
      res.status(500).json({ error: 'Failed to reject request.' });
    }
  };

  // GET /api/salestrack/teams/:teamId/invite-hash
exports.getInviteHash = async (req, res) => {
    try {
      const { teamId } = req.params;
      const team = await Teams.findByPk(teamId);
      if (!team) return res.status(404).json({ error: 'Team not found.' });
      return res.json({
        teamId: team.id,
        teamName: team.name,
        hash: hashTeamName(team), // <- guna util server
      });
    } catch (e) {
      console.error('[getInviteHash]', e);
      res.status(500).json({ error: 'Failed to get invite hash.' });
    }
  };

  exports.test = async (req,res) => {
    res.json({ message: 'test' });
  }
  