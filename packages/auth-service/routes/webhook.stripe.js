// routes/webhook.stripe.js (kemas kini)
const express = require('express');
const router = express.Router();
const { stripe } = require('../config/stripe');
const { Plan, Subscription, BillingCustomer, ToolSubscription } = require('@suites/database-models');

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('[Stripe] evt:', event.type);
  } catch (err) {
    console.error('[Stripe] verify fail:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.customer && s.metadata?.userId) {
          await BillingCustomer.upsert({
            userId: Number(s.metadata.userId),
            stripeCustomerId: s.customer,
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object;

        // dapatkan subscription penuh + items
        const sub = await stripe.subscriptions.retrieve(inv.subscription, { expand: ['items.data.price.product'] });

        // resolve userId via metadata or BillingCustomer
        let userId = sub?.metadata?.userId ? Number(sub.metadata.userId) : null;
        if (!userId && inv.customer) {
          const row = await BillingCustomer.findOne({ where: { stripeCustomerId: inv.customer } });
          userId = row?.userId || null;
        }
        if (!userId) return res.json({ received: true });

        // upsert master subscription
        const statusMap = { trialing:'trialing', active:'active', past_due:'past_due', canceled:'canceled' };
        const status = statusMap[sub.status] || 'expired';
        let master = await Subscription.findOne({ where: { userId, provider: 'stripe', providerRef: sub.id } });
        if (!master) {
          master = await Subscription.create({
            userId,
            status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
            provider: 'stripe',
            providerRef: sub.id,
          });
        } else {
          await master.update({
            status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          });
        }

        // sync setiap item -> ToolSubscription
        for (const it of sub.items.data) {
          const priceId = it.price?.id;
          if (!priceId) continue;
          const plan = await Plan.findOne({ where: { stripePriceId: priceId } });
          if (!plan) continue;

          await ToolSubscription.upsert({
            userId,
            toolId: plan.toolId || 'unknown',
            planCode: plan.code,
            status,
            trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
            startedAt: new Date(sub.current_period_start * 1000),
            provider: 'stripe',
            providerSubRef: sub.id,
            providerItemRef: it.id,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          }, { conflictFields: ['userId','toolId'] });
        }

        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const s = event.data.object; // subscription
        const statusMap = { trialing:'trialing', active:'active', past_due:'past_due', canceled:'canceled' };
        const status = statusMap[s.status] || 'expired';

        // update master
        await Subscription.update(
          { status, currentPeriodEnd: new Date(s.current_period_end * 1000) },
          { where: { provider: 'stripe', providerRef: s.id } }
        );

        // update semua tool items bawah subscription ini
        for (const it of s.items?.data || []) {
          await ToolSubscription.update(
            {
              status,
              currentPeriodEnd: new Date(s.current_period_end * 1000),
            },
            { where: { provider: 'stripe', providerSubRef: s.id, providerItemRef: it.id } }
          );
        }
        break;
      }

      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[Stripe] webhook handler error:', err);
    res.status(500).send('Webhook handler failed');
  }
});

module.exports = router;
