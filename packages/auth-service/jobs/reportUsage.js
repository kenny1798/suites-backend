// Simpan sebagai: server/jobs/reportUsage.js

require('dotenv').config({ path: '../.env' }); // Pastikan ia baca .env dari root
const cron = require('node-cron');
const { ToolSubscription } = require('@suites/database-models');
const { Op } = require('sequelize');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Fungsi utama untuk mencari langganan aktif dan melapor penggunaan ke Stripe.
 */
async function reportUsage() {
  console.log('Running usage reporting job...', new Date().toISOString());

  // 1. Cari semua langganan tool yang aktif atau dalam percubaan
  const activeSubs = await ToolSubscription.findAll({
    where: {
      provider: 'stripe',
      status: {
        [Op.in]: ['active', 'trialing'], // Kita lapor juga untuk trial, Stripe takkan caj
      },
      // Pastikan ada providerItemRef, ini adalah ID untuk meter
      providerItemRef: {
        [Op.not]: null, 
      },
    },
  });

  if (!activeSubs.length) {
    console.log('No active subscriptions to report.');
    return;
  }

  console.log(`Found ${activeSubs.length} subscriptions to report.`);

  // 2. Loop melalui setiap langganan dan hantar rekod penggunaan
  for (const sub of activeSubs) {
    try {
      console.log(`Reporting usage for sub_item: ${sub.providerItemRef}`);
      
      // Hantar 1 unit penggunaan ke Stripe
      await stripe.subscriptionItems.createUsageRecord(
        sub.providerItemRef, // Ini adalah ID subscription item ('si_...')
        {
          quantity: 1,
          // 'increment' akan tambah 1 pada jumlah sedia ada
          // 'set' akan ganti jumlah sedia ada dengan nilai ni
          action: 'increment', 
        }
      );
      
      console.log(`Successfully reported for ${sub.providerItemRef}`);
    } catch (error) {
      console.error(`Failed to report usage for ${sub.providerItemRef}:`, error.message);
    }
  }
  console.log('Usage reporting job finished.');
}

// 3. Jadualkan tugas untuk berjalan setiap hari pada 11:59 PM
//    Format: 'minit jam hari bulan hari_minggu' (* = setiap)
cron.schedule('59 23 * * *', () => {
  reportUsage();
}, {
  scheduled: true,
  timezone: "Asia/Kuala_Lumpur"
});

console.log('Cron job for usage reporting scheduled. Waiting for the scheduled time...');

// (Pilihan) Jalankan sekali masa skrip mula untuk tujuan ujian
// reportUsage();