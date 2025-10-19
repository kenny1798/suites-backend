// routes/billing.subscribe.js
const router = require('express').Router();
const { validateToken } = require('../middlewares/AuthMiddleware');
const { Plan, ToolSubscription } = require('@suites/database-models');
const { getOrCreateMasterSubscription, addOrUpdateToolItem } = require('../services/stripeService');

router.post('/subscribe', validateToken, async (req, res) => {
  try {
    const { toolId, planCode } = req.body || {};
    if (!toolId) return res.status(400).json({ ok:false, message:'toolId required' });
    if (!planCode) return res.status(400).json({ ok:false, message:'planCode required' });

    const plan = await Plan.findByPk(planCode);
    if (!plan) return res.status(404).json({ ok:false, message:'PLAN_NOT_FOUND' });
    if (!plan.stripePriceId || !/^price_/.test(plan.stripePriceId)) {
      return res.status(400).json({ ok:false, message:'PRICE_NOT_CONFIGURED_FOR_PLAN' });
    }
    if (plan.toolId && plan.toolId !== toolId) {
      return res.status(400).json({ ok:false, message:'WRONG_TOOL_FOR_PLAN' });
    }

    // dapatkan / cipta master subscription
    const master = await getOrCreateMasterSubscription({ user: req.user });

    // tambah item untuk tool ini (proration pending to next invoice)
    const item = await addOrUpdateToolItem({ masterSubId: master.providerRef, priceId: plan.stripePriceId });

    // upsert ToolSubscription row
    const now = new Date();
    const [row, created] = await ToolSubscription.findOrCreate({
      where: { userId: req.user.id, toolId },
      defaults: {
        planCode,
        status: 'active',                      // akan adjust by webhook juga
        trialEnd: null,
        startedAt: now,
        provider: 'stripe',
        providerSubRef: master.providerRef,
        providerItemRef: item.id,
        currentPeriodEnd: master.currentPeriodEnd,
      }
    });

    if (!created) {
      await row.update({
        planCode,
        status: 'active',
        trialEnd: null,
        startedAt: row.startedAt || now,
        provider: 'stripe',
        providerSubRef: master.providerRef,
        providerItemRef: item.id,
        currentPeriodEnd: master.currentPeriodEnd,
      });
    }

    // FE boleh redirect ke billing portal atau return ok
    res.json({ ok:true, subscriptionId: master.providerRef, toolItemId: item.id });
  } catch (e) {
    console.error('POST /billing/subscribe error:', e);
    res.status(500).json({ ok:false, message:'SUBSCRIBE_FAILED', detail: e.message });
  }
});

module.exports = router;
