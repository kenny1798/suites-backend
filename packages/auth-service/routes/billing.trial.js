// routes/billing.trial.js (baru — generic by toolId)
const router = require('express').Router();
const { Op } = require('sequelize');
const { validateToken } = require('../middlewares/AuthMiddleware');
const { Plan, PlanFeature, ToolSubscription, Tool } = require('@suites/database-models');
const { resolveEntitlements } = require('../services/entitlements');

router.post('/trial/start', validateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { toolId, planCode } = req.body || {};

    if (!toolId) return res.status(400).json({ error: 'toolId required' });
    if (!planCode) return res.status(400).json({ error: 'planCode required' });

    const plan = await Plan.findByPk(planCode);
    if (!plan) return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    if (plan.toolId && plan.toolId !== toolId) {
      return res.status(400).json({ error: 'WRONG_TOOL_FOR_PLAN', detail: { toolId: plan.toolId } });
    }

    // block kalau user dah ada trial/active utk tool ni
    const hasAny = await ToolSubscription.findOne({
      where: {
        userId, toolId,
        status: { [Op.in]: ['active','trialing','past_due'] },
      }
    });
    if (hasAny) return res.status(409).json({ error: 'ALREADY_SUBSCRIBED_OR_TRIALING' });

    // block kalau pernah trial tool ini?
    const hadTrial = await ToolSubscription.findOne({
      where: { userId, toolId, status: 'expired' },
    });
    // (kalau nak ketat: check mana-mana row trial pernah wujud ikut flag metadata lain)

    const days = Number(plan.trialDays || 30);
    const now = new Date();
    const trialEnd = new Date(now.getTime() + days*24*60*60*1000);

    const sub = await ToolSubscription.create({
      userId, toolId, planCode,
      status: 'trialing',
      trialEnd,
      startedAt: now,
      provider: 'manual',
      providerSubRef: null,
      providerItemRef: null,
      currentPeriodEnd: null,
    });

    const planFeatures = await PlanFeature.findAll({ where: { planCode } });
    const entitlements = resolveEntitlements({ plan, planFeatures, toolSubscription: sub });

    res.json(entitlements);
  } catch (e) {
    console.error('POST /billing/trial/start error:', e);
    res.status(500).json({ error: 'TRIAL_START_FAILED' });
  }
});

module.exports = router;
