// routes/billing.core.js (kemas kini entitlements)
const router = require("express").Router();
const { Op } = require("sequelize");
const { Plan, PlanFeature, ToolSubscription } = require("@suites/database-models");
const { validateToken } = require("../middlewares/AuthMiddleware");
const { resolveEntitlements } = require("../services/entitlements");

router.get("/me/entitlements", validateToken, async (req, res) => {
  try {
    const { toolId } = req.query;
    const where = { userId: req.user.id };
    if (toolId) where.toolId = toolId;

    // ambil semua tool subs (atau satu tool)
    const toolSubs = await ToolSubscription.findAll({ where });

    // compile entitlements per tool
    const out = [];
    for (const ts of toolSubs) {
      const plan = await Plan.findByPk(ts.planCode);
      const planFeatures = await PlanFeature.findAll({ where: { planCode: ts.planCode } });
      const e = resolveEntitlements({ plan, planFeatures, toolSubscription: ts });
      out.push(e);
    }

    // Jika toolId diberi → pulangkan satu; else array
    if (toolId) return res.json(out[0] || null);
    res.json(out);
  } catch (e) {
    console.error('GET /billing/me/entitlements error:', e);
    res.status(500).json({ error: 'ENTITLEMENTS_FAILED' });
  }
});

module.exports = router;