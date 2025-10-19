// server/middlewares/requireFeature.js
/**
 * Usage:
 *   app.get('/api/st/export', validateToken, attachSubscription, requireFeature('EXPORT_EXCEL'), handler)
 *   // atau kebab: requireFeature('reports') — ikut apa yang kau simpan di Feature.key / PlanFeature.featureKey
 */
module.exports = function requireFeature(featureKey) {
  return (req, res, next) => {
    const ent = req.entitlements;
    const f = ent?.features?.[featureKey];
    if (!f?.enabled) {
      return res.status(402).json({
        error: 'PAYWALL',
        reason: 'FEATURE_LOCKED',
        featureKey,
        status: ent?.status || 'none',
        plan: ent?.plan || null,
      });
    }
    next();
  };
};
