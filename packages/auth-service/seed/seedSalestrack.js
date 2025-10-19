// server/seed/seedSalestrack.js
require('dotenv').config();
const { sequelize, Tool, Plan, Feature, PlanFeature } = require('@suites/database-models');

/** ====== Config (EN) ====== */
const TOOL = {
  slug: 'salestrack',
  name: 'SalesTrack',
  shortName: 'SalesTrack',
  category: 'CRM',
  basePath: '/salestrack',
  icon: '🧭',
  description: 'Lightweight CRM with team tracking and follow-up.',
  isActive: true,
  sort: 10,
};

const FEATURES = [
  { key: 'ST_DB_ADD_UNLIMITED',    name: 'Add Database (Single & Bulk)',    description: 'Add records without limits; single and bulk import.' },
  { key: 'ST_ADVANCED_STATS',      name: 'Advanced Statistics',             description: 'In-depth reports and charts.' },
  { key: 'ST_EXPORT_DATA',         name: 'Export Data (Excel/CSV)',         description: 'Export data to Excel/CSV.' },
  { key: 'ST_PUSH_NOTIF_PWA',      name: 'Push Notifications (PWA)',        description: 'PWA notifications for follow-ups.' },

  { key: 'ST_TEAM_INVITE_3TIER',   name: '3-Tier Management',               description: 'Invite team; 3-level management structure.' },
  { key: 'ST_TEAM_MONITOR_EXPORT', name: 'Team Monitoring & Export',        description: 'Managers can monitor members and export data.' },

  { key: 'ST_ENTERPRISE_MULTI_TEAM', name: 'Combine Multiple Teams',        description: 'Manage and combine multiple teams at once.' },
];

const PRICE = {
  ST_PRO_INDIVIDUAL_MONTHLY: process.env.STRIPE_PRICE_ST_PRO_INDIVIDUAL_MONTHLY || null,
  ST_PRO_TEAM_MONTHLY:       process.env.STRIPE_PRICE_ST_PRO_TEAM_MONTHLY || null,
  ST_ENTERPRISE_MONTHLY:     process.env.STRIPE_PRICE_ST_ENTERPRISE_MONTHLY || null,
};

const PLANS = [
  // Trials (one-time “virtual plans”, used only for entitlements/trial)
  { code: 'ST_TRIAL_INDIVIDUAL',       name: 'SalesTrack Trial (Individual, 30 days)', type: 'PRO', priceCents: 0,     interval: 'one_time', trialDays: 30,  isActive: true, stripePriceId: null,                             seats: 1 },
  { code: 'ST_TRIAL_TEAM',             name: 'SalesTrack Trial (Team, 30 days)',       type: 'PRO', priceCents: 0,     interval: 'one_time', trialDays: 30,  isActive: true, stripePriceId: null,                             seats: 5 },

  // Paid (Stripe prices required)
  { code: 'ST_PRO_INDIVIDUAL_MONTHLY', name: 'SalesTrack Pro (Individual) — Monthly',  type: 'PRO', priceCents: 2900,  interval: 'month',    trialDays: null, isActive: true, stripePriceId: PRICE.ST_PRO_INDIVIDUAL_MONTHLY, seats: 1 },
  { code: 'ST_PRO_TEAM_MONTHLY',       name: 'SalesTrack Pro (Team) — Monthly',        type: 'PRO', priceCents: 12900, interval: 'month',    trialDays: null, isActive: true, stripePriceId: PRICE.ST_PRO_TEAM_MONTHLY,       seats: 5 },
  { code: 'ST_ENTERPRISE_MONTHLY',     name: 'SalesTrack Enterprise — Monthly',        type: 'PRO', priceCents: 19900, interval: 'month',    trialDays: null, isActive: true, stripePriceId: PRICE.ST_ENTERPRISE_MONTHLY,     seats: null },
];

const INDIVIDUAL = ['ST_DB_ADD_UNLIMITED', 'ST_ADVANCED_STATS', 'ST_EXPORT_DATA', 'ST_PUSH_NOTIF_PWA'];
const TEAM       = [...INDIVIDUAL, 'ST_TEAM_INVITE_3TIER', 'ST_TEAM_MONITOR_EXPORT'];
const ENTERPRISE = [...TEAM, 'ST_ENTERPRISE_MULTI_TEAM'];

const PLAN_FEATURE_MAP = {
  ST_TRIAL_INDIVIDUAL: INDIVIDUAL,
  ST_TRIAL_TEAM: TEAM,
  ST_PRO_INDIVIDUAL_MONTHLY: INDIVIDUAL,
  ST_PRO_TEAM_MONTHLY: TEAM,
  ST_ENTERPRISE_MONTHLY: ENTERPRISE,
};

/** ====== Runner ====== */
async function run() {
  await sequelize.authenticate();
  console.log('DB connected:', process.env.DB_NAME);

  await sequelize.transaction(async (t) => {
    // 1) Ensure Tool exists
    await Tool.findOrCreate({
      where: { slug: TOOL.slug },
      defaults: TOOL,
      transaction: t,
    });

    // 2) Seed Features
    for (const f of FEATURES) {
      await Feature.findOrCreate({
        where: { key: f.key },
        defaults: f,
        transaction: t,
      });
    }

    // 3) Seed Plans (attach toolId)
    for (const p0 of PLANS) {
      const p = { ...p0, toolId: TOOL.slug };
      if (p.interval !== 'one_time' && p.priceCents > 0 && !p.stripePriceId) {
        console.warn(`⚠️ Plan ${p.code} has no Stripe price id (price_...). Checkout will fail until provided.`);
      }
      await Plan.upsert(p, { transaction: t });
    }

    // 4) Seed PlanFeature links
    for (const [planCode, keys] of Object.entries(PLAN_FEATURE_MAP)) {
      for (const featureKey of keys) {
        await PlanFeature.findOrCreate({
          where: { planCode, featureKey },
          defaults: { planCode, featureKey, enabled: true, limitInt: null },
          transaction: t,
        });
      }
    }
  });

  console.log('✅ SalesTrack tool, plans and features seeded');
  process.exit(0);
}

if (require.main === module) {
  run().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { run };
