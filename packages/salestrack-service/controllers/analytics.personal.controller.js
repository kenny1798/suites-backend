const { Op } = require('sequelize');
const {
  TeamMembers,
  Contacts,
  Opportunities,
  OpportunityStatuses,
  LeadHistory,
  Targets,
} = require('@suites/database-models');

/* ---------- helpers ---------- */

const asDateStr = (d) => {
    const x = new Date(d);
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${x.getFullYear()}-${m}-${day}`;
  };

function localRangeToUTC(fromStr, toStr, _tzOffsetMinutes = 0) {
    // bina tarikh dalam ZON MASA LOKAL mesin (Node)
    const [y1, m1, d1] = fromStr.split('-').map(Number);
    const [y2, m2, d2] = toStr.split('-').map(Number);
  
    // ini sudah "local time"; objek Date simpan nilai UTC dalaman yang betul
    const startLocal = new Date(y1, (m1 - 1), d1, 0, 0, 0, 0);
    const endLocal   = new Date(y2, (m2 - 1), d2, 23, 59, 59, 999);
  
    // ❗ Tiada pelarasan offset di sini.
    return { startUTC: startLocal, endUTC: endLocal };
  }
  
  function localDay(utc, tzOffsetMin) {
    const ms = utc instanceof Date ? utc.getTime() : Date.parse(utc);
    const shifted = new Date(ms + tzOffsetMin * 60 * 1000); // shift ke waktu tempatan
    // Guna getUTC* supaya kita baca terus 'calendar' selepas shift, elak local-DST host
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  
  function daysBetween(from, to) {
    const [y1, m1, d1] = from.split('-').map(Number);
    const [y2, m2, d2] = to.split('-').map(Number);
    let cur = Date.UTC(y1, m1 - 1, d1);          // hari mula (UTC midnight)
    const end = Date.UTC(y2, m2 - 1, d2);        // hari akhir (UTC midnight)
    const out = [];
    while (cur <= end) {
      const dt = new Date(cur);
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      out.push(`${y}-${m}-${d}`);
      cur += 24 * 60 * 60 * 1000;                // tambah sehari (86400000 ms)
    }
    return out;
  }

  const toUTCWindow = (from, to) => {
    const [y1,m1,d1] = from.split('-').map(Number);
    const [y2,m2,d2] = to.split('-').map(Number);
    return {
      startUTC: new Date(y1, m1 - 1, d1, 0, 0, 0, 0),
      endUTC:   new Date(y2, m2 - 1, d2, 23, 59, 59, 999),
    };
  };

  function daysInMonth(year, month1to12) {
    return new Date(year, month1to12, 0).getDate(); // month arg is 1..12
  }
  
  function clampDateStr(a, lo, hi) {
    return a < lo ? lo : (a > hi ? hi : a);
  }
  
  function enumerateMonthsInRange(from, to) {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    const out = [];
    let y = fy, m = fm;
    while (y < ty || (y === ty && m <= tm)) {
      out.push({ year: y, month: m });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }
  
  async function fetchTargetsForRange(teamId, userId, from, to) {
    const months = enumerateMonthsInRange(from, to);
    if (months.length === 0) return [];
  
    // Query by OR of (year, month) pairs
    const whereOr = months.map(({year, month}) => ({ year, month }));
    return Targets.findAll({
      where: { teamId, userId, [Op.or]: whereOr },
      attributes: ['year','month','targetValue','targetUnits'],
      raw: true,
    });
  }
  
  function computeTargetCentsForRange(from, to, targetRows) {
    let total = 0;
  
    for (const row of targetRows) {
      const { year, month, targetValue = 0 } = row; // cents
      const dim = daysInMonth(year, month);
  
      const monthStr = String(month).padStart(2, '0');
      const monthStart = `${year}-${monthStr}-01`;
      const monthEnd = `${year}-${monthStr}-${String(dim).padStart(2,'0')}`;
  
      const start = clampDateStr(monthStart, from, to);
      const end   = clampDateStr(monthEnd,   from, to);
  
      if (start > end) continue; // no overlap
  
      const overlapDays = daysBetween(start, end).length; // inclusive
      const portion = overlapDays / dim;
  
      // Round to nearest cent for stability
      total += Math.round(targetValue * portion);
    }
    return total;
  }
  
  function buildDailyTargetMap(from, to, targetRows) {
    const byMonth = new Map(); // 'yyyy-mm' -> { dailyCents }
    for (const r of targetRows) {
      const m = String(r.month).padStart(2,'0');
      const key = `${r.year}-${m}`;
      const dim = daysInMonth(r.year, r.month);
      const daily = dim > 0 ? (r.targetValue || 0) / dim : 0; // float cents/day
      byMonth.set(key, daily);
    }
  
    const perDay = new Map(); // 'yyyy-mm-dd' -> integer cents (rounded)
    for (const d of daysBetween(from, to)) {
      const ym = d.slice(0,7); // 'yyyy-mm'
      const daily = byMonth.get(ym) || 0;
      perDay.set(d, Math.round(daily));
    }
    return perDay;
  }
  


/* ---------- CONTROLLER: Personal Summary ---------- */
exports.personalSummary = async (req, res) => {
  try {
    const teamId   = Number(req.query.teamId);
    const userId   = Number(req.query.userId);
    const from     = String(req.query.from || '');
    const to       = String(req.query.to   || '');
    const tzOffset = Number(req.query.tzOffset ?? 0);

    if (!teamId || !userId || !from || !to) {
      return res.status(400).json({ error: 'teamId, userId, from, to are required.' });
    }

    // authorize
    const member = await TeamMembers.findOne({ where: { teamId, userId } });
    if (!member) return res.status(403).json({ error: 'Forbidden' });

    const { startUTC, endUTC } = localRangeToUTC(from, to, tzOffset);

    // ---------- NEW: fetch/prorate targets in range ----------
    const targetRows = await fetchTargetsForRange(teamId, userId, from, to);
    const targetCents = computeTargetCentsForRange(from, to, targetRows);
    // ----------------------------------------------------------

    // KPI: contacts & opps created
    const [newContacts, oppCreated] = await Promise.all([
      Contacts.count({ where: { teamId, userId, createdAt: { [Op.between]: [startUTC, endUTC] } } }),
      Opportunities.count({ where: { teamId, userId, createdAt: { [Op.between]: [startUTC, endUTC] } } }),
    ]);

    // KPI: won deals & value (STRICT isWon)
    const wonIds = (await OpportunityStatuses.findAll({
      where: { teamId, isWon: true }, attributes: ['id'],
    })).map(s => s.id);

    const wonHist = await LeadHistory.findAll({
      attributes: ['id', 'details', 'createdAt'],
      where: { type: 'STATUS_CHANGE', createdAt: { [Op.between]: [startUTC, endUTC] } },
      include: [{ model: Opportunities, attributes: ['id','value','userId','teamId'], where: { teamId, userId }, required: true }],
      raw: true,
    });

    let wonDeals = 0;
    let actualCents = 0;
    for (const h of wonHist) {
      const det = h.details || {};
      const toId = det.toStatusId ?? det.to?.id;
      if (!wonIds.includes(Number(toId))) continue;
      wonDeals += 1;
      actualCents += Number(h['Opportunity.value'] || 0);
    }

    res.json({
      range: { from, to, tzOffset },
      kpis: {
        targetCents,               // <— now computed
        actualCents,
        wonDeals,
        newContacts,
        oppCreated
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute personal summary.', details: e.message });
  }
};

exports.personalSheet = async (req, res) => {
  const teamId   = Number(req.query.teamId);
  const userId   = Number(req.query.userId);
  const from     = String(req.query.from || '').slice(0,10);
  const to       = String(req.query.to   || '').slice(0,10);
  const tzOffset = Number(req.query.tzOffset ?? 0);

  if (!teamId || !userId || !from || !to) {
    return res.status(400).json({ error: 'teamId, userId, from, to are required.' });
  }

  try {
    const member = await TeamMembers.findOne({ where: { teamId, userId } });
    if (!member) return res.status(403).json({ error: 'Forbidden' });

    const { startUTC, endUTC } = localRangeToUTC(from, to);
    const days = daysBetween(from, to);

    // ---------- NEW: build daily target map ----------
    const targetRows = await fetchTargetsForRange(teamId, userId, from, to);
    const dailyTargetMap = buildDailyTargetMap(from, to, targetRows); // date -> cents
    // -------------------------------------------------

    // 1) won status ids
    const wonIds = (await OpportunityStatuses.findAll({
      where: { teamId, isWon: true }, attributes: ['id'],
    })).map(s => s.id);

    // 2) won transitions history (scoped to user)
    const wonHist = wonIds.length ? await LeadHistory.findAll({
      attributes: ['id', 'details', 'createdAt'],
      where: {
        type: 'STATUS_CHANGE',
        createdAt: { [Op.between]: [startUTC, endUTC] },
      },
      include: [{
        model: Opportunities,
        attributes: ['id', 'value', 'userId', 'teamId'],
        where: { teamId, userId },
        required: true,
      }],
      raw: true,
    }) : [];

    const wonMap = new Map(); // day -> cents
    for (const h of wonHist) {
      const det = h.details || {};
      const toId = det.toStatusId ?? det.to?.id;
      if (!wonIds.includes(Number(toId))) continue;
      const day = localDay(h.createdAt, tzOffset);
      const cents = Number(h['Opportunity.value'] || 0);
      wonMap.set(day, (wonMap.get(day) || 0) + cents);
    }

    // 4) New Contacts + Opp Created
    const contactRows = await Contacts.findAll({
      where: { teamId, userId, createdAt: { [Op.between]: [startUTC, endUTC] } },
      attributes: ['id','createdAt'],
    });
    const oppRows = await Opportunities.findAll({
      where: { teamId, userId, createdAt: { [Op.between]: [startUTC, endUTC] } },
      attributes: ['id','createdAt'],
    });

    const contactMap = new Map();
    for (const c of contactRows) {
      const day = localDay(c.createdAt, tzOffset);
      contactMap.set(day, (contactMap.get(day) || 0) + 1);
    }
    const oppMap = new Map();
    for (const o of oppRows) {
      const day = localDay(o.createdAt, tzOffset);
      oppMap.set(day, (oppMap.get(day) || 0) + 1);
    }

    // 5) Sheet (now with targetCents per day)
    const sheet = days.map(d => ({
      date: d,
      targetCents: dailyTargetMap.get(d) || 0,   // <— filled
      actualCents: wonMap.get(d) || 0,
      newContacts: contactMap.get(d) || 0,
      oppCreated:  oppMap.get(d) || 0,
    }));

    res.json({ range: { from, to, tzOffset }, sheet });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to compute daily sheet.', details: e.message });
  }
};

exports.personalConversions = async (req, res) => {
    try {
      const teamId = Number(req.query.teamId);
      const userId = Number(req.query.userId);
      const from   = String(req.query.from || '').slice(0,10);
      const to     = String(req.query.to   || '').slice(0,10);
  
      if (!teamId || !userId || !from || !to) {
        return res.status(400).json({ error: 'teamId, userId, from, to are required.' });
      }
  
      // authorize membership
      const membership = await TeamMembers.findOne({ where: { teamId, userId } });
      if (!membership) return res.status(403).json({ error: 'Forbidden' });
  
      const { startUTC, endUTC } = toUTCWindow(from, to);
  
      // 1) Status dictionary (id -> {name, category, isWon})
      const statuses = await OpportunityStatuses.findAll({
        where: { teamId },
        attributes: ['id', 'name', 'category', 'isWon'],
        raw: true,
      });
      const statusById = Object.fromEntries(statuses.map(s => [s.id, s]));
  
      // 2) LeadHistory STATUS_CHANGE in window, scoped to this user's opps
      const historyRows = await LeadHistory.findAll({
        attributes: ['id', 'details', 'createdAt'],
        include: [{
          model: Opportunities,
          attributes: [],
          where: { teamId, userId },
          required: true,
        }],
        where: {
          type: 'STATUS_CHANGE',
          createdAt: { [Op.between]: [startUTC, endUTC] },
        },
        raw: true,
      });
  
      // 3) Reduce to transitions
      const stageMap = new Map();     // `${fromId}->${toId}` -> {from, to, count}
      const catMap   = new Map();     // `${fromCat}->${toCat}` -> {from, to, count}
      let prospectToDeal = 0;
      let dealToOutcome  = 0;
      let winTransitions = 0;
  
      for (const h of historyRows) {
        const det = h.details || {};
        // details could be { from:{id,name}, to:{id,name} } OR { fromStatusId, toStatusId }
        const fromId = det.from?.id ?? det.fromStatusId ?? null;
        const toId   = det.to?.id   ?? det.toStatusId   ?? null;
        if (!fromId || !toId) continue;
  
        const fromS = statusById[fromId];
        const toS   = statusById[toId];
        if (!fromS || !toS) continue;
  
        // stage transitions
        const k1 = `${fromId}->${toId}`;
        const s  = stageMap.get(k1) || { from: fromS.name, to: toS.name, count: 0 };
        s.count += 1;
        stageMap.set(k1, s);
  
        // category transitions
        const k2 = `${fromS.category}->${toS.category}`;
        const c  = catMap.get(k2) || { from: fromS.category, to: toS.category, count: 0 };
        c.count += 1;
        catMap.set(k2, c);
  
        // KPIs
        if (fromS.category === 'Prospect' && toS.category === 'Deal') prospectToDeal += 1;
        if (fromS.category === 'Deal'     && toS.category === 'Outcome') dealToOutcome += 1;
        if (toS.isWon) winTransitions += 1;
      }
  
      // denominators
      const totalNewOpps = await Opportunities.count({
        where: { teamId, userId, createdAt: { [Op.between]: [startUTC, endUTC] } },
      });
  
      const totalDeals = Array.from(catMap.values())
        .filter(x => x.to === 'Deal' && x.from !== 'Deal')
        .reduce((s, x) => s + x.count, 0);
  
      const resp = {
        prospectToDeal: { count: prospectToDeal, totalNewOpps },
        dealToOutcome:  { count: dealToOutcome,  totalDeals },
        winRate:        { countWon: winTransitions, totalNewOpps },
        topStageMoves:  Array.from(stageMap.values()).sort((a,b)=>b.count-a.count).slice(0,20),
        categoryMoves:  Array.from(catMap.values()).sort((a,b)=>b.count-a.count),
      };
  
      res.json(resp);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to compute conversions.', details: e.message });
    }
  };
  
  
