// Simpan sebagai: routes/billing.js

const router = require('express').Router();
const { 
  ToolSubscription, 
  Plan, 
  Tool, 
  PlanFeature, 
  BillingCustomer, 
  Users,
  TeamMembers,
  Teams
} = require('@suites/database-models');
const { Op } = require('sequelize'); 
const { validateToken } = require('../middlewares/AuthMiddleware'); // Import middleware pengesahan
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * @route   GET /api/billing/me/subscriptions
 * @desc    Dapatkan semua langganan tool milik pengguna semasa
 * @access  Private
 */
router.get('/me/subscriptions', validateToken, async (req, res) => {
  try {
    const userId = req.user.id; 

    const subscriptions = await ToolSubscription.findAll({
      where: { userId: userId },

      // Sertakan data dari table lain untuk kurangkan API call di frontend
      include: [
        {
          model: Plan,
          // 'as' mungkin tidak diperlukan jika tiada alias, tapi bagus untuk diletak
        },
        {
          model: Tool,
        }
      ],
      
      // Susun ikut tarikh dikemas kini, yang terbaru di atas
      order: [['updatedAt', 'DESC']],
    });

    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching user subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

/**
 * @route   GET /api/billing/me/entitlements (VERSI DEBUG)
 * @desc    Dapatkan semua kebenaran (peribadi + warisan dari team)
 * @access  Private
 */
router.get('/me/entitlements', validateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`\n--- Memeriksa Entitlements untuk userId: ${userId} ---`);

    const entitledTools = new Set();
    const allPlanCodes = new Set();

    // 1. Dapatkan langganan peribadi pengguna (Direct Subscriptions)
    const directSubs = await ToolSubscription.findAll({
      where: { userId, status: ['active', 'trialing'] },
    });
    console.log(`Langkah 1: Jumpa ${directSubs.length} langganan peribadi.`);
    directSubs.forEach(sub => {
      entitledTools.add(sub.toolId);
      allPlanCodes.add(sub.planCode);
    });

    // 2. Dapatkan langganan yang diwarisi dari pasukan (Inherited Subscriptions)
    console.log('Langkah 2: Mencari langganan dari pasukan...');
    const memberships = await TeamMembers.findAll({ where: { userId } });
    console.log(`   - Jumpa ${memberships.length} keahlian pasukan.`);
    
    const teamIds = memberships.map(m => m.teamId);

    if (teamIds.length > 0) {
      console.log(`   - ID Pasukan: [${teamIds.join(', ')}]`);
      const teams = await Teams.findAll({ where: { id: { [Op.in]: teamIds } } });
      const ownerIds = [...new Set(teams.map(t => t.ownerId))]; // Guna Set untuk elak owner sama
      console.log(`   - ID Pemilik Pasukan: [${ownerIds.join(', ')}]`);
      
      if (ownerIds.length > 0) {
        const inheritedSubs = await ToolSubscription.findAll({
          where: {
            userId: { [Op.in]: ownerIds },
            status: ['active', 'trialing'],
          },
        });
        console.log(`   - Jumpa ${inheritedSubs.length} langganan yang diwarisi dari pemilik.`);
        inheritedSubs.forEach(sub => {
          entitledTools.add(sub.toolId);
          allPlanCodes.add(sub.planCode);
        });
      }
    }

    if (entitledTools.size === 0) {
      console.log('--- HASIL: Tiada tool ditemui. Menghantar array kosong. ---\n');
      return res.json({ tools: [], features: {} });
    }

    const planFeatures = await PlanFeature.findAll({
      where: { planCode: { [Op.in]: Array.from(allPlanCodes) }, enabled: true },
    });

    const features = {};
    for (const pf of planFeatures) {
      features[pf.featureKey] = { enabled: true, limit: pf.limitInt };
    }

    console.log(`--- HASIL: Tool yang layak: [${Array.from(entitledTools).join(', ')}] ---\n`);
    res.json({
      tools: Array.from(entitledTools),
      features: features,
    });
  } catch (error) {
    console.error('Error fetching user entitlements:', error);
    res.status(500).json({ error: 'Failed to fetch entitlements' });
  }
});

/**
 * @route   POST /api/billing/create-checkout-session
 * @desc    Cipta sesi pembayaran Stripe untuk langganan baru (versi Anchor Billing)
 * @access  Private
 */
router.post('/create-checkout-session', validateToken, async (req, res) => {
  try {
    // ... (kod untuk dapatkan priceId, userId, plan, dan stripeCustomerId masih sama) ...
    const { priceId } = req.body;
    const userId = req.user.id;
    if (!priceId) return res.status(400).json({ error: 'PRICE_ID_REQUIRED' });
    const plan = await Plan.findOne({ where: { stripePriceId: priceId, isActive: true } });
    if (!plan) return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    let billingInfo = await BillingCustomer.findOne({ where: { userId } });
    let stripeCustomerId;
    if (billingInfo) {
      stripeCustomerId = billingInfo.stripeCustomerId;
    } else {
      const user = await Users.findByPk(userId);
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id }});
      await BillingCustomer.create({ userId, stripeCustomerId: customer.id });
      stripeCustomerId = customer.id;
    }

    const sessionOptions = {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId }],
      mode: 'subscription',
      metadata: { userId, planCode: plan.code },
      success_url: `${process.env.CLIENT}payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT}store?tool=${plan.toolId}&status=cancelled`,
    };

    const subscriptionData = {};
    
    // === PERUBAHAN LOGIK DI SINI ===
    if (plan.trialDays > 0) {
      // JIKA ADA TRIAL: Hanya set tempoh trial.
      // Tarikh bil akan bermula secara automatik selepas trial tamat.
      subscriptionData.trial_period_days = plan.trialDays;
    } else {
      // JIKA TIADA TRIAL: Baru kita set anchor ke 1 haribulan.
      const now = new Date();
      const anchorDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const billingCycleAnchor = Math.floor(anchorDate.getTime() / 1000);
      
      subscriptionData.billing_cycle_anchor = billingCycleAnchor;
      subscriptionData.proration_behavior = 'create_prorations';
    }
    // ============================
    
    // Letak semua data langganan dalam sessionOptions jika ada
    if (Object.keys(subscriptionData).length > 0) {
        sessionOptions.subscription_data = subscriptionData;
    }
    
    const session = await stripe.checkout.sessions.create(sessionOptions);

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});


/**
 * @route   POST /api/billing/verify-session
 * @desc    Sahkan status Stripe Checkout Session selepas redirect
 * @access  Private
 */
router.post('/verify-session', validateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;
    if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });

    const subStatus = session.subscription?.status; // 'active' | 'trialing' | 'past_due' | 'incomplete' | ...

    console.log('[verify] session:', {
      status: session.status,
      payment_status: session.payment_status,
      sub_status: subStatus,
      customer: session.customer,
    });

    if (session.status !== 'complete') {
      return res.status(402).json({ error: 'CHECKOUT_NOT_COMPLETE' });
    }

    // ✅ Kriteria lulus yang lebih robust:
    const ok = subStatus === 'active' || subStatus === 'trialing';
    if (!ok) {
      // Kalau nak lebih ketat, boleh whitelist juga 'past_due' sementara — tapi biasanya jangan.
      return res.status(402).json({ error: 'PAYMENT_NOT_COMPLETED' });
    }

    // Safety: pastikan session untuk user ni
    const billingInfo = await BillingCustomer.findOne({ where: { userId } });
    if (!billingInfo || session.customer !== billingInfo.stripeCustomerId) {
      return res.status(403).json({ error: 'CUSTOMER_MISMATCH' });
    }

    // Lulus
    return res.json({
      success: true,
      subscriptionStatus: subStatus,
      paymentStatus: session.payment_status,
    });
  } catch (e) {
    console.error('Error verifying session:', e);
    return res.status(500).json({ error: 'Failed to verify session' });
  }
});



/**
 * @route   POST /api/billing/create-portal-session
 * @desc    Cipta sesi Stripe Customer Portal untuk pengguna urus langganan
 * @access  Private
 */
router.post('/create-portal-session', validateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Cari maklumat bil pengguna untuk dapatkan stripeCustomerId
    const billingInfo = await BillingCustomer.findOne({ where: { userId } });

    // Jika pengguna tiada rekod bil (belum pernah langgan), hantar ralat
    if (!billingInfo || !billingInfo.stripeCustomerId) {
      return res.status(404).json({ error: 'BILLING_INFO_NOT_FOUND' });
    }
    
    const stripeCustomerId = billingInfo.stripeCustomerId;

    // 2. Cipta sesi Portal menggunakan Stripe SDK
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      // URL untuk pengguna kembali selepas selesai urusan di portal
      return_url: `${process.env.CLIENT}billing`, 
    });

    // 3. Hantar URL portal ke frontend
    res.json({ url: portalSession.url });

  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

/**
 * @route   GET /api/billing/invoices
 * @desc    Dapatkan sejarah invois untuk pengguna semasa
 * @access  Private
 */
router.get('/invoices', validateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const billingInfo = await BillingCustomer.findOne({ where: { userId } });

    // Jika pengguna tiada rekod bil, tiada invois untuk dipaparkan
    if (!billingInfo || !billingInfo.stripeCustomerId) {
      return res.json([]); // Hantar array kosong
    }

    // Dapatkan senarai invois dari Stripe
    const invoices = await stripe.invoices.list({
      customer: billingInfo.stripeCustomerId,
      limit: 20, // Hadkan kepada 20 invois terbaharu
    });

    // Format data supaya lebih mudah diguna oleh frontend
    const formattedInvoices = invoices.data.map(inv => ({
      id: inv.id,
      date: new Date(inv.created * 1000),
      amount: (inv.amount_paid / 100).toFixed(2),
      status: inv.status,
      pdfUrl: inv.invoice_pdf, // URL untuk muat turun PDF
    }));

    res.json(formattedInvoices);
    
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

module.exports = router;