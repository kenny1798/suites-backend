// services/stripeService.js (baru/kemas kini)
const { stripe } = require('../config/stripe');
const { BillingCustomer, Subscription } = require('@suites/database-models');
const { firstOfNextMonthTs } = require('../utils/billingAnchor');

function endOfMonthAnchorTs(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const eom = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0)) - 1; // last sec prev month end
  // Anchor to next month start (collect at start), or keep to a fixed day:
  const nextMonthStart = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  return Math.floor(nextMonthStart.getTime() / 1000);
}

async function getOrCreateStripeCustomer(user) {
  let row = await BillingCustomer.findOne({ where: { userId: user.id } });
  if (row?.stripeCustomerId) return row.stripeCustomerId;

  const cust = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: String(user.id) }
  });

  await BillingCustomer.upsert({ userId: user.id, stripeCustomerId: cust.id });
  return cust.id;
}

async function getOrCreateMasterSubscription({ user, anchorTs }) {
  // cari subscription stripe yg aktif/canceled terbaru
  let master = await Subscription.findOne({
    where: { userId: user.id, provider: 'stripe' },
    order: [['updatedAt','DESC']]
  });

  if (master?.providerRef && ['active','trialing','past_due'].includes(master.status)) {
    return master; // reuse
  }

  const customerId = await getOrCreateStripeCustomer(user);

  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [],                              // kosong – items akan ditambah kemudian
    billing_cycle_anchor: anchorTs || endOfMonthAnchorTs(),
    proration_behavior: 'create_prorations',
    collection_method: 'charge_automatically',
    metadata: { userId: String(user.id) },
  });

  master = await Subscription.create({
    userId: user.id,
    status: sub.status === 'trialing' ? 'trialing' :
            sub.status === 'active' ? 'active' :
            sub.status === 'past_due' ? 'past_due' : 'expired',
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    billingAnchorDay: null,
    provider: 'stripe',
    providerRef: sub.id,
  });

  return master;
}

async function addOrUpdateToolItem({ masterSubId, priceId }) {
  const sub = await stripe.subscriptions.retrieve(masterSubId, { expand: ['items'] });

  // tengok kalau item price sama dah wujud
  const existing = sub.items.data.find(it => it.price?.id === priceId);
  if (existing) return existing; // no-op

  const updated = await stripe.subscriptions.update(masterSubId, {
    proration_behavior: 'create_prorations',
    items: [{ price: priceId, quantity: 1 }], // tambah item baru
  });

  // return item yang match priceId
  return updated.items.data.find(it => it.price?.id === priceId);
}

async function createCheckoutSessionAddItem({ user, priceId, successUrl, cancelUrl }) {
  const customerId = await getOrCreateStripeCustomer(user);

  // cuba detect master subscription sedia ada
  const master = await getOrCreateMasterSubscription({ user }); // anchor + empty items
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      billing_cycle_anchor: Math.floor(new Date(master.currentPeriodEnd || new Date()).getTime()/1000), // atau endOfMonthAnchorTs()
      proration_behavior: 'create_prorations',
      metadata: { userId: String(user.id) },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return session;
}


async function createCheckoutSessionForFirstTool({ user, priceId, successUrl, cancelUrl }) {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_creation: 'if_required',
    customer_email: user.email,                       // or pre-create a Customer
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      billing_cycle_anchor: firstOfNextMonthTs(),    // bill on the 1st
      proration_behavior: 'create_prorations',       // don't charge prorations now
      metadata: { userId: String(user.id) },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}
async function addToolAsItem({ subscriptionId, priceId, quantity = 1 }) {
  const updated = await stripe.subscriptions.update(subscriptionId, {
    proration_behavior: 'create_prorations',      // defer charge to next invoice
    items: [{ price: priceId, quantity }],        // add new tool
  });
  // Find the item we just added
  return updated.items.data.find(i => i.price?.id === priceId);
}


module.exports = {
  endOfMonthAnchorTs,
  getOrCreateStripeCustomer,
  getOrCreateMasterSubscription,
  addOrUpdateToolItem,
  createCheckoutSessionAddItem,
  createCheckoutSessionForFirstTool,
  addToolAsItem,
};
