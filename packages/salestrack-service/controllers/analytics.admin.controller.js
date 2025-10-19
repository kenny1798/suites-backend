const { Op } = require('sequelize');
const {
  TeamMembers,
  TeamReporting,
  Users,
  Contacts,
  Opportunities,
  OpportunityStatuses,
  LeadHistory
} = require('@suites/database-models');

/* ---------- helpers ---------- */

// build UTC window from local YYYY-MM-DD
function toUTCWindow(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return {
    startUTC: new Date(y1, m1 - 1, d1, 0, 0, 0, 0),
    endUTC:   new Date(y2, m2 - 1, d2, 23, 59, 59, 999),
  };
}

// won = current status has isWon = true
const wonWhere = () => ({ '$OpportunityStatus.isWon$': true });

async function isTeamMember(teamId, userId) {
  return !!(await TeamMembers.findOne({ where: { teamId, userId } }));
}

/* =========================================================================
   LIST: managers with their reps (for selectors)
   ======================================================================= */
exports.listManagersAndReps = async (req, res) => {
  try {
    const teamId = Number(req.query.teamId);
    const userId = req.user.id; // owner/admin (must be team member at least)
    if (!teamId) return res.status(400).json({ error: 'teamId is required' });

    if (!await isTeamMember(teamId, userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // distinct managers present in TeamReporting
    const managerRows = await TeamReporting.findAll({
      where: { teamId },
      attributes: ['managerUserId'],
      group: ['managerUserId'],
      include: [{ model: Users, as: 'Manager', attributes: ['id','name','email'] }],
      order: [[{ model: Users, as: 'Manager' }, 'name', 'ASC']],
    });

    // for each manager, pull reps
    const managers = [];
    for (const m of managerRows) {
      const reps = await TeamReporting.findAll({
        where: { teamId, managerUserId: m.managerUserId },
        attributes: ['repUserId'],
        include: [{ model: Users, as: 'Rep', attributes: ['id','name','email'] }],
        order: [[{ model: Users, as: 'Rep' }, 'name', 'ASC']],
      });
      managers.push({
        id: m.managerUserId,
        name: m.Manager?.name || `User #${m.managerUserId}`,
        email: m.Manager?.email || null,
        reps: reps.map(r => ({
          id: r.repUserId,
          name: r.Rep?.name || `User #${r.repUserId}`,
          email: r.Rep?.email || null,
        })),
      });
    }

    // also include “all team users” (useful to show “Whole team” numbers)
    const allMembers = await TeamMembers.findAll({
      where: { teamId }, attributes: ['userId'],
      include: [{ model: Users, attributes: ['id','name','email'] }],
    });
    const teamUsers = allMembers.map(r => ({
      id: r.userId,
      name: r.User?.name || `User #${r.userId}`,
      email: r.User?.email || null,
    }));

    res.json({ managers, teamUsers });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load managers/reps.', details: e.message });
  }
};

/* =========================================================================
   SUMMARY (Owner/Admin)
   scopes:
     - team: whole team
     - manager_all: manager + their reps
     - manager_reps: reps under manager (exclude manager)
     - rep: single individual rep
   params:
     teamId, from, to, tzOffset (optional)
     scope = 'team'|'manager_all'|'manager_reps'|'rep'
     managerUserId (for manager_* scopes)
     repUserId (for rep scope)
   ======================================================================= */
exports.adminSummary = async (req, res) => {
  try {
    const teamId       = Number(req.query.teamId);
    const scope        = String(req.query.scope || 'team');
    const managerUserId= req.query.managerUserId ? Number(req.query.managerUserId) : null;
    const repUserId    = req.query.repUserId ? Number(req.query.repUserId) : null;
    const from         = String(req.query.from || '').slice(0,10);
    const to           = String(req.query.to   || '').slice(0,10);
    const tzOffset     = Number(req.query.tzOffset ?? 0);

    const requesterId  = req.user.id; // owner/admin

    if (!teamId || !from || !to) {
      return res.status(400).json({ error: 'teamId, from, to are required.' });
    }
    // At least be a member of the team
    if (!await isTeamMember(teamId, requesterId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Build userId scope
    let scopedUserIds = [];

    if (scope === 'team') {
      const tms = await TeamMembers.findAll({ where: { teamId }, attributes: ['userId'] });
      scopedUserIds = tms.map(x => x.userId);

    } else if (scope === 'manager_all' || scope === 'manager_reps') {
      if (!managerUserId) return res.status(400).json({ error: 'managerUserId is required for this scope.' });
      // confirm this manager belongs to team
      if (!await isTeamMember(teamId, managerUserId)) {
        return res.status(400).json({ error: 'managerUserId is not a member of team.' });
      }
      const repLinks = await TeamReporting.findAll({
        where: { teamId, managerUserId }, attributes: ['repUserId'],
      });
      const reps = repLinks.map(r => r.repUserId);
      scopedUserIds = (scope === 'manager_all') ? [managerUserId, ...reps] : reps;

    } else if (scope === 'rep') {
      if (!repUserId) return res.status(400).json({ error: 'repUserId is required for scope=rep.' });
      // ensure this rep is in team
      if (!await isTeamMember(teamId, repUserId)) {
        return res.status(400).json({ error: 'repUserId is not a member of team.' });
      }
      scopedUserIds = [repUserId];

    } else {
      return res.status(400).json({ error: 'Invalid scope.' });
    }

    // Empty scope -> zeros
    if (!scopedUserIds.length) {
      return res.json({
        range: { from, to, tzOffset },
        scope: { scope, managerUserId, repUserId, userIds: [] },
        kpis: { targetCents: 0, actualCents: 0, wonDeals: 0, newContacts: 0, oppCreated: 0 },
      });
    }

    const { startUTC, endUTC } = toUTCWindow(from, to);

    // KPI: contacts & opps created
    const [newContacts, oppCreated] = await Promise.all([
      Contacts.count({
        where: { teamId, userId: { [Op.in]: scopedUserIds }, createdAt: { [Op.between]: [startUTC, endUTC] } },
      }),
      Opportunities.count({
        where: { teamId, userId: { [Op.in]: scopedUserIds }, createdAt: { [Op.between]: [startUTC, endUTC] } },
      }),
    ]);

    // KPI: won rows and sum value
    const wonRows = await Opportunities.findAll({
      where: {
        teamId,
        userId: { [Op.in]: scopedUserIds },
        ...wonWhere(),
        [Op.or]: [
          { closedAt: { [Op.between]: [startUTC, endUTC] } },
          { closedAt: null, updatedAt: { [Op.between]: [startUTC, endUTC] } },
        ],
      },
      attributes: ['id','value','createdAt','updatedAt','closedAt'],
      include: [{ model: OpportunityStatuses, attributes: [] }],
    });

    const wonDeals    = wonRows.length;
    const actualCents = wonRows.reduce((s, r) => s + Number(r.value || 0), 0);

    // Target — left as 0 (sum your per-user targets here if you have them)
    const targetCents = 0;

    res.json({
      range: { from, to, tzOffset },
      scope: { scope, managerUserId, repUserId, userIds: scopedUserIds },
      kpis: { targetCents, actualCents, wonDeals, newContacts, oppCreated },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute admin summary.', details: e.message });
  }
};

/* =========================================================================
   SHEET (Owner/Admin)
   Same scopes as adminSummary; returns daily buckets used by table/graphs.
   ======================================================================= */
   exports.adminSheet = async (req, res) => {
    try {
      const teamId        = Number(req.query.teamId);
      const scope         = String(req.query.scope || 'team');
      const managerUserId = req.query.managerUserId ? Number(req.query.managerUserId) : null;
      const repUserId     = req.query.repUserId ? Number(req.query.repUserId) : null;
      const from          = String(req.query.from || '').slice(0,10);
      const to            = String(req.query.to   || '').slice(0,10);
      const tzOffset      = Number(req.query.tzOffset ?? 0);
  
      const requesterId   = req.user.id;
  
      if (!teamId || !from || !to) {
        return res.status(400).json({ error: 'teamId, from, to are required.' });
      }
      if (!await isTeamMember(teamId, requesterId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
  
      // ---- scope → userIds (same as summary) ----
      let scopedUserIds = [];
      if (scope === 'team') {
        const tms = await TeamMembers.findAll({ where: { teamId }, attributes: ['userId'] });
        scopedUserIds = tms.map(x => x.userId);
      } else if (scope === 'manager_all' || scope === 'manager_reps') {
        if (!managerUserId) return res.status(400).json({ error: 'managerUserId is required for this scope.' });
        if (!await isTeamMember(teamId, managerUserId)) {
          return res.status(400).json({ error: 'managerUserId is not a member of team.' });
        }
        const repLinks = await TeamReporting.findAll({
          where: { teamId, managerUserId }, attributes: ['repUserId'],
        });
        const reps = repLinks.map(r => r.repUserId);
        scopedUserIds = (scope === 'manager_all') ? [managerUserId, ...reps] : reps;
      } else if (scope === 'rep') {
        if (!repUserId) return res.status(400).json({ error: 'repUserId is required for scope=rep.' });
        if (!await isTeamMember(teamId, repUserId)) {
          return res.status(400).json({ error: 'repUserId is not a member of team.' });
        }
        scopedUserIds = [repUserId];
      } else {
        return res.status(400).json({ error: 'Invalid scope.' });
      }
  
      // empty scope → empty sheet (not an error)
      if (!scopedUserIds.length) {
        return res.json({ range: { from, to, tzOffset }, sheet: [] });
      }
  
      const { startUTC, endUTC } = toUTCWindow(from, to);
  
      // build stable days array in UTC (avoid host TZ/DST)
      const days = [];
      {
        const [y1, m1, d1] = from.split('-').map(Number);
        const [y2, m2, d2] = to.split('-').map(Number);
        let cur = Date.UTC(y1, m1 - 1, d1);
        const end = Date.UTC(y2, m2 - 1, d2);
        while (cur <= end) {
          const t = new Date(cur);
          const y = t.getUTCFullYear();
          const m = String(t.getUTCMonth() + 1).padStart(2, '0');
          const d = String(t.getUTCDate()).padStart(2, '0');
          days.push(`${y}-${m}-${d}`);
          cur += 86400000; // +1 day
        }
      }
  
      // function: convert a UTC timestamp to “local day” using tzOffset (minutes east of UTC)
      const localDay = (utc) => {
        const ms = utc instanceof Date ? utc.getTime() : Date.parse(utc);
        const shifted = new Date(ms + tzOffset * 60 * 1000);
        const y = shifted.getUTCFullYear();
        const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
        const d = String(shifted.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
  
      // ---- pull rows in window and bucket by local day ----
  
      // won rows (value for Actual)
      const wonRows = await Opportunities.findAll({
        where: {
          teamId,
          userId: { [Op.in]: scopedUserIds },
          ...wonWhere(),
          [Op.or]: [
            { closedAt: { [Op.between]: [startUTC, endUTC] } },
            { closedAt: null, updatedAt: { [Op.between]: [startUTC, endUTC] } },
          ],
        },
        attributes: ['id','value','createdAt','updatedAt','closedAt'],
        include: [{ model: OpportunityStatuses, attributes: [] }],
      });
  
      const contactRows = await Contacts.findAll({
        where: { teamId, userId: { [Op.in]: scopedUserIds }, createdAt: { [Op.between]: [startUTC, endUTC] } },
        attributes: ['id','createdAt'],
      });
  
      const oppRows = await Opportunities.findAll({
        where: { teamId, userId: { [Op.in]: scopedUserIds }, createdAt: { [Op.between]: [startUTC, endUTC] } },
        attributes: ['id','createdAt'],
      });
  
      const wonMap = new Map();
      for (const r of wonRows) {
        const when = r.closedAt || r.updatedAt || r.createdAt;
        const d = localDay(when);
        wonMap.set(d, (wonMap.get(d) || 0) + Number(r.value || 0));
      }
  
      const cMap = new Map();
      for (const c of contactRows) {
        const d = localDay(c.createdAt);
        cMap.set(d, (cMap.get(d) || 0) + 1);
      }
  
      const oMap = new Map();
      for (const o of oppRows) {
        const d = localDay(o.createdAt);
        oMap.set(d, (oMap.get(d) || 0) + 1);
      }
  
      const sheet = days.map(d => ({
        date: d,
        targetCents: 0,                     // plug daily targets here if you have them
        actualCents: wonMap.get(d) || 0,
        newContacts: cMap.get(d) || 0,
        oppCreated:  oMap.get(d) || 0,
      }));
  
      res.json({ range: { from, to, tzOffset }, sheet });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to compute admin sheet.', details: e.message });
    }
  };

  /* =======================================================================
   CONVERSIONS (Owner/Admin)
   - scope: 'team' | 'manager_all' | 'manager_reps' | 'rep'
   - win rate = transitions INTO a won status / total new opps (created in range)
   - prospect→deal & deal→outcome taken from LeadHistory STATUS_CHANGE
   ===================================================================== */
exports.adminConversions = async (req, res) => {
  try {
    const teamId        = Number(req.query.teamId);
    const scope         = String(req.query.scope || 'team');
    const managerUserId = req.query.managerUserId ? Number(req.query.managerUserId) : null;
    const repUserId     = req.query.repUserId ? Number(req.query.repUserId) : null;
    const from          = String(req.query.from || '').slice(0,10);
    const to            = String(req.query.to   || '').slice(0,10);

    const requesterId   = req.user.id;

    if (!teamId || !from || !to) return res.status(400).json({ error: 'teamId, from, to are required.' });
    if (!await isTeamMember(teamId, requesterId)) return res.status(403).json({ error: 'Forbidden' });

    // ---- scope -> userIds (same logic as adminSummary/adminSheet) ----
    let scopedUserIds = [];
    if (scope === 'team') {
      const tms = await TeamMembers.findAll({ where: { teamId }, attributes: ['userId'] });
      scopedUserIds = tms.map(x => x.userId);
    } else if (scope === 'manager_all' || scope === 'manager_reps') {
      if (!managerUserId) return res.status(400).json({ error: 'managerUserId is required.' });
      if (!await isTeamMember(teamId, managerUserId)) return res.status(400).json({ error: 'managerUserId not in team.' });

      const links = await TeamReporting.findAll({ where: { teamId, managerUserId }, attributes: ['repUserId'] });
      const reps = links.map(r => r.repUserId);
      scopedUserIds = (scope === 'manager_all') ? [managerUserId, ...reps] : reps;
    } else if (scope === 'rep') {
      if (!repUserId) return res.status(400).json({ error: 'repUserId is required for scope=rep.' });
      if (!await isTeamMember(teamId, repUserId)) return res.status(400).json({ error: 'repUserId not in team.' });
      scopedUserIds = [repUserId];
    } else {
      return res.status(400).json({ error: 'Invalid scope.' });
    }

    if (!scopedUserIds.length) {
      return res.json({
        prospectToDeal: { count: 0, totalNewOpps: 0 },
        dealToOutcome:  { count: 0, totalDeals: 0 },
        winRate:        { countWon: 0, totalNewOpps: 0 },
        topStageMoves:  [],
        categoryMoves:  [],
      });
    }

    const { startUTC, endUTC } = toUTCWindow(from, to);

    // ---- status dictionary ----
    const statuses = await OpportunityStatuses.findAll({
      where: { teamId },
      attributes: ['id','name','category','isWon'],
      raw: true,
    });
    const statusById = Object.fromEntries(statuses.map(s => [s.id, s]));

    // ---- history rows: only STATUS_CHANGE, only opps in scope ----
    const historyRows = await LeadHistory.findAll({
      attributes: ['id','details','createdAt'],
      include: [{
        model: Opportunities,
        attributes: [],
        required: true,
        where: { teamId, userId: { [Op.in]: scopedUserIds } },
      }],
      where: {
        type: 'STATUS_CHANGE',
        createdAt: { [Op.between]: [startUTC, endUTC] },
      },
      raw: true,
    });

    // ---- reduce ----
    const stageMap = new Map(); // `${fromId}->${toId}` -> {from,to,count}
    const catMap   = new Map(); // `${fromCat}->${toCat}` -> {from,to,count}
    let prospectToDeal = 0;
    let dealToOutcome  = 0;
    let winTransitions = 0;

    for (const h of historyRows) {
      const det = h.details || {};
      const fromId = det.from?.id ?? det.fromStatusId ?? null;
      const toId   = det.to?.id   ?? det.toStatusId   ?? null;
      if (!fromId || !toId) continue;

      const fromS = statusById[fromId];
      const toS   = statusById[toId];
      if (!fromS || !toS) continue;

      const k1 = `${fromId}->${toId}`;
      const s  = stageMap.get(k1) || { from: fromS.name, to: toS.name, count: 0 };
      s.count += 1;
      stageMap.set(k1, s);

      const k2 = `${fromS.category}->${toS.category}`;
      const c  = catMap.get(k2) || { from: fromS.category, to: toS.category, count: 0 };
      c.count += 1;
      catMap.set(k2, c);

      if (fromS.category === 'Prospect' && toS.category === 'Deal') prospectToDeal += 1;
      if (fromS.category === 'Deal'     && toS.category === 'Outcome') dealToOutcome += 1;
      if (toS.isWon) winTransitions += 1;
    }

    // ---- denominators ----
    const totalNewOpps = await Opportunities.count({
      where: { teamId, userId: { [Op.in]: scopedUserIds }, createdAt: { [Op.between]: [startUTC, endUTC] } },
    });

    const totalDeals = Array.from(catMap.values())
      .filter(x => x.to === 'Deal' && x.from !== 'Deal')
      .reduce((s,x)=> s + x.count, 0);

    res.json({
      prospectToDeal: { count: prospectToDeal, totalNewOpps },
      dealToOutcome:  { count: dealToOutcome,  totalDeals },
      winRate:        { countWon: winTransitions, totalNewOpps },
      topStageMoves:  Array.from(stageMap.values()).sort((a,b)=>b.count-a.count).slice(0,20),
      categoryMoves:  Array.from(catMap.values()).sort((a,b)=>b.count-a.count),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute admin conversions.', details: e.message });
  }
};

  
