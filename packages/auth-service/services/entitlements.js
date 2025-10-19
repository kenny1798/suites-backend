// services/entitlements.js
function resolveEntitlements({ plan, planFeatures, toolSubscription }) {
  const base = {
    toolId: plan?.toolId || null,
    planCode: plan?.code || null,
    planName: plan?.name || plan?.code || null,
    status: toolSubscription?.status || 'expired',
    trialEnd: toolSubscription?.trialEnd || null,
    currentPeriodEnd: toolSubscription?.currentPeriodEnd || null,
    features: {},
  };

  for (const pf of planFeatures) {
    base.features[pf.featureKey] = {
      enabled: !!pf.enabled,
      limitInt: pf.limitInt,
    };
  }
  return base;
}

module.exports = { resolveEntitlements };
