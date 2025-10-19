// middlewares/plan.guard.js
const { Op } = require('sequelize');
const { ToolSubscription, Teams } = require('@suites/database-models');

const ACTIVE_STATUSES = ['active', 'trialing']; // tambah lagi kalau perlu

async function getActiveSalestrackSub(userId) {
  const now = new Date();
  return ToolSubscription.findOne({
    where: {
      userId,
      toolId: 'salestrack',
      status: { [Op.in]: ACTIVE_STATUSES },
      [Op.and]: [
        { [Op.or]: [{ cancelAt: null }, { cancelAt: { [Op.gt]: now } }] },
        { [Op.or]: [{ currentPeriodEnd: null }, { currentPeriodEnd: { [Op.gt]: now } }] },
      ],
    },
    order: [['createdAt', 'DESC']],
  });
}

/**
 * Gate untuk POST /api/salestrack/teams/setup
 * - Individual → 403
 * - Pro Team → 1 team sahaja (owner). Kalau dah ada: 403
 * - Enterprise → pass
 */
exports.requireSalestrackSetupEntitlement = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const sub = await getActiveSalestrackSub(userId);

    if (!sub) {
      return res.status(403).json({
        error: 'SUBSCRIPTION_REQUIRED',
        message: 'An active SalesTrack subscription is required.',
      });
    }

    const code = sub.planCode;

    if (code === 'ST_PRO_INDIVIDUAL_MONTHLY') {
      return res.status(403).json({
        error: 'INSUFFICIENT_PLAN',
        message: 'Your plan does not allow creating a team. Please upgrade.',
      });
    }

    if (code === 'ST_PRO_TEAM_MONTHLY') {
      // limit: 1 team for owner
      const ownedCount = await Teams.count({ where: { ownerId: userId } });
      if (ownedCount > 0) {
        return res.status(403).json({
          error: 'TEAM_LIMIT_REACHED',
          message: 'Your plan allows creating only 1 team.',
        });
      }
      return next();
    }

    if (code === 'ST_ENTERPRISE_MONTHLY') {
      return next();
    }

    // default: block unknown plan
    return res.status(403).json({
      error: 'UNKNOWN_PLAN',
      message: `Plan ${code} is not allowed for this action.`,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'ENTITLEMENT_CHECK_FAILED',
      details: err.message,
    });
  }
};
