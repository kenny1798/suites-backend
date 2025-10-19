// server/middlewares/attachSubscription.js
const { Op } = require('sequelize');
const { Plan, PlanFeature, Subscription } = require('@suites/database-models');
const { resolveEntitlements } = require('../services/entitlements');

module.exports = async function attachSubscription(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

    // Prefer yang active/trialing dahulu
    let sub = await Subscription.findOne({
      where: { userId, status: { [Op.in]: ['active', 'trialing'] } },
      order: [['updatedAt', 'DESC']],
    });

    // Fallback latest apa-apa status
    if (!sub) {
      sub = await Subscription.findOne({
        where: { userId },
        order: [['updatedAt', 'DESC']],
      });
    }

    if (!sub) {
      req.subscription = null;
      req.entitlements = resolveEntitlements({ plan: null, planFeatures: [], subscription: null });
      return next();
    }

    const plan = await Plan.findByPk(sub.planCode);
    const planFeatures = await PlanFeature.findAll({ where: { planCode: sub.planCode } });

    req.subscription = sub;
    req.entitlements = resolveEntitlements({ plan, planFeatures, subscription: sub });
    return next();
  } catch (err) {
    console.error('attachSubscription error:', err);
    return res.status(500).json({ error: 'SUBS_ENTITLEMENT_FAILED' });
  }
};
