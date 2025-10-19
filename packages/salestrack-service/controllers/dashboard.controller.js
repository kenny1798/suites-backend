// packages/salestrack-service/controllers/performance.controller.js

const {
  Opportunities,
  OpportunityStatuses,
  Contacts,
  Targets,
  TeamMembers,
  TeamReporting,   // ⇐ pastikan model & migration wujud
  LeadHistory,     // ⇐ pastikan model di-export dari database-models
} = require('@suites/database-models');

const { Op, fn, col } = require('sequelize');
const {
  eachDayOfInterval,
  format,
  startOfMonth,
  endOfMonth,
} = require('date-fns');

// ==================== Helpers ====================

const dayKey = (d) => format(d, 'yyyy-MM-dd');

/**
 * Resolve scope user IDs mengikut role:
 * - OWNER / ADMIN: semua user dalam team
 * - MANAGER: rep yang berada di bawah dia (TeamReporting)
 * - SALES_REP: diri sendiri
 */
async function resolveScope({ teamId, viewerUserId }) {
  const membership = await TeamMembers.findOne({ where: { userId: viewerUserId, teamId } });
  if (!membership) return { allowed: false, reason: 'not_member' };

  if (['OWNER', 'ADMIN'].includes(membership.role)) {
    const allMembers = await TeamMembers.findAll({
      where: { teamId },
      attributes: ['userId'],
      raw: true,
    });
    return {
      allowed: true,
      teamId,
      role: membership.role,
      userIds: allMembers.map(m => m.userId), // semua user
    };
  }

  if (membership.role === 'MANAGER') {
    const reps = await TeamReporting.findAll({
      where: { teamId, managerUserId: viewerUserId },
      attributes: ['repUserId'],
      raw: true,
    });
    return {
      allowed: true,
      teamId,
      role: membership.role,
      userIds: reps.map(r => r.repUserId), // hanya subordinate
    };
  }

  // SALES_REP / member biasa
  return {
    allowed: true,
    teamId,
    role: membership.role,
    userIds: [viewerUserId],
  };
}

/** Median helper untuk sen (integer) */
function medianInt(arr) {
  if (!arr?.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

// ==================== Controller ====================

exports.getSummary = async (req, res) => {
  try {
    const viewerUserId = req.user.id;
    const { teamId, startDate: start, endDate: end } = req.query;

    if (!teamId || !start || !end) {
      return res
        .status(400)
        .json({ error: 'teamId, startDate, and endDate are required.' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    // ---- scope
    const scope = await resolveScope({ teamId, viewerUserId });
    if (!scope.allowed) {
      return res.status(403).json({ error: 'Forbidden: You are not a member of this team.' });
    }

    // Helper untuk tambah filter scope user pada query-query per-user
    const userScoped = (extra = {}) => ({
      teamId: scope.teamId,
      ...(scope.userIds?.length ? { userId: { [Op.in]: scope.userIds } } : {}),
      ...extra,
    });

    // ---- rangka harian untuk UI lama (summary/sheet/graph basic)
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const daily = days.map((d) => ({
      date: dayKey(d),
      target: 0,
      actualSales: 0,
      newContacts: 0,
    }));
    const dayMap = new Map(daily.map((r) => [r.date, r]));

    // ===================== TARGET (prorated dari Targets) =====================
    const monthYearPairs = Array.from(
      new Set(days.map((d) => `${d.getFullYear()}-${d.getMonth() + 1}`))
    ).map((k) => {
      const [y, m] = k.split('-').map(Number);
      return { year: y, month: m };
    });

    const targets = await Targets.findAll({
      where: {
        teamId: scope.teamId,
        ...(scope.userIds?.length ? { userId: { [Op.in]: scope.userIds } } : {}),
        [Op.or]: monthYearPairs,
      },
      raw: true,
    });

    for (const t of targets) {
      const mStart = startOfMonth(new Date(t.year, t.month - 1, 1));
      const mEnd = endOfMonth(mStart);

      const overlapStart = mStart > startDate ? mStart : startDate;
      const overlapEnd = mEnd < endDate ? mEnd : endDate;
      if (overlapStart > overlapEnd) continue;

      const monthDaysCount = eachDayOfInterval({ start: mStart, end: mEnd }).length;
      const perDay = Math.floor(Number(t.targetValue || 0) / monthDaysCount);

      eachDayOfInterval({ start: overlapStart, end: overlapEnd }).forEach((d) => {
        const k = dayKey(d);
        const row = dayMap.get(k);
        if (row) row.target += perDay;
      });
    }

    // ===================== ACTUAL SALES (Outcome statuses) =====================
    const outcomeStatuses = await OpportunityStatuses.findAll({
      attributes: ['id'],
      where: { teamId: scope.teamId, category: 'Outcome' },
      raw: true,
    });
    const outcomeIds = outcomeStatuses.map((s) => s.id);

    let actualSalesCents = 0;
    let closedDealValues = []; // untuk avg/median
    if (outcomeIds.length) {
      // sum by day (closedAt)
      const salesRows = await Opportunities.findAll({
        attributes: [
          [fn('DATE', col('closedAt')), 'day'],
          [fn('SUM', col('value')), 'total'],
        ],
        where: userScoped({
          statusId: { [Op.in]: outcomeIds },
          closedAt: { [Op.between]: [startDate, endDate] },
        }),
        group: [fn('DATE', col('closedAt'))],
        raw: true,
      });

      for (const r of salesRows) {
        const k = r.day;
        const amt = Number(r.total || 0);
        const row = dayMap.get(k);
        if (row) row.actualSales = amt;
        actualSalesCents += amt;
      }

      // ambil value setiap closed deal untuk avg & median
      const closedDeals = await Opportunities.findAll({
        attributes: ['value'],
        where: userScoped({
          statusId: { [Op.in]: outcomeIds },
          closedAt: { [Op.between]: [startDate, endDate] },
        }),
        raw: true,
      });
      closedDealValues = closedDeals.map(d => Number(d.value || 0));
    }

    // ===================== INTake: contacts & opportunities =====================
    const [contactsAdded, opportunitiesCreated] = await Promise.all([
      Contacts.count({ where: userScoped({ createdAt: { [Op.between]: [startDate, endDate] } }) }),
      Opportunities.count({ where: userScoped({ createdAt: { [Op.between]: [startDate, endDate] } }) }),
    ]);

    // ===================== wonDeals (Outcome + lostReason is NULL) =====================
    let wonDeals = 0;
    if (outcomeIds.length) {
      wonDeals = await Opportunities.count({
        where: userScoped({
          statusId: { [Op.in]: outcomeIds },
          closedAt: { [Op.between]: [startDate, endDate] },
          lostReason: null,
        }),
      });
    }

    // avg & median deal size untuk closed Outcome dalam range
    const avgDealSize = closedDealValues.length
      ? Math.round(closedDealValues.reduce((a, b) => a + b, 0) / closedDealValues.length)
      : 0;
    const medianDealSize = medianInt(closedDealValues);

    // ===================== CONVERSIONS (STATUS_CHANGE) =====================
    // Ambil semua status team (untuk map id->name/category)
    const teamStatuses = await OpportunityStatuses.findAll({
      where: { teamId: scope.teamId },
      raw: true,
    });
    const statusById = Object.fromEntries(teamStatuses.map(s => [s.id, s]));

    // Ambil history STATUS_CHANGE dalam range, enforce scope via join Opportunities
    const historyRows = await LeadHistory.findAll({
      attributes: ['id', 'details', 'createdAt'],
      include: [{
        model: Opportunities,
        attributes: [],
        where: userScoped(), // teamId + userId IN scope.userIds (jika ada)
        required: true,
      }],
      where: {
        type: 'STATUS_CHANGE',
        createdAt: { [Op.between]: [startDate, endDate] },
      },
      raw: true,
    });

    // Reduce kepada stageTransitions + categoryTransitions
    const stageMap = new Map(); // key = `${fromId}->${toId}`
    const catMap = new Map();   // key = `${fromCat}->${toCat}`

    for (const h of historyRows) {
      const det = h.details || {};
      const fromId = det.fromStatusId ?? null;
      const toId   = det.toStatusId ?? null;
      if (!fromId || !toId) continue;

      const from = statusById[fromId];
      const to   = statusById[toId];
      if (!from || !to) continue; // skip kalau status tak wujud lagi

      // stage-level
      const k1 = `${fromId}->${toId}`;
      const s = stageMap.get(k1) || {
        fromStatusId: fromId,
        toStatusId: toId,
        fromName: from.name,
        toName: to.name,
        count: 0,
      };
      s.count += 1;
      stageMap.set(k1, s);

      // category-level
      const k2 = `${from.category}->${to.category}`;
      const c = catMap.get(k2) || {
        fromCategory: from.category,
        toCategory: to.category,
        count: 0,
      };
      c.count += 1;
      catMap.set(k2, c);
    }

    const stageTransitions = Array.from(stageMap.values());
    const categoryTransitions = Array.from(catMap.values());

    // ===================== Totals (kompatibel dengan UI lama) =====================
    const dailyBreakdown = Array.from(dayMap.values());
    const totals = dailyBreakdown.reduce(
      (acc, d) => {
        acc.targetedSales += d.target;
        acc.actualSales += d.actualSales;
        acc.newContacts += d.newContacts;
        return acc;
      },
      { targetedSales: 0, actualSales: 0, newContacts: 0 }
    );
    totals.salesGap = totals.targetedSales - totals.actualSales;

    // ===================== Response =====================
    return res.json({
      sales: {
        targetedSales: totals.targetedSales,
        actualSales: actualSalesCents,
        salesGap: totals.targetedSales - actualSalesCents,
        wonDeals,
        avgDealSize,
        medianDealSize,
      },
      intake: {
        contactsAdded,
        opportunitiesCreated,
      },
      conversions: {
        stageTransitions,
        categoryTransitions,
      },
      // untuk paparan lama
      totals,
      dailyBreakdown,
    });

  } catch (err) {
    console.error('Error fetching dashboard summary:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
};
