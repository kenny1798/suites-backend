// /salestrack-service/index.js (Versi penuh yang dicadangkan)

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const db = require('@suites/database-models');

const app = express();

// --- Middleware Asas ---
app.use(helmet());
app.use(cors());
app.use(express.json());

// --- Routes ---
const teamsRouter = require('./routes/teams');
const contactsRouter = require('./routes/contacts');
const opportunitiesRouter = require('./routes/opportunities');
const dashboardRouter = require('./routes/dashboard');
const reportingRouter = require('./routes/reporting');
const invitesRouter = require('./routes/invitations');
const activitiesRouter = require('./routes/activities');
const tasksRouter = require('./routes/tasks');
const timelineRouter = require('./routes/timeline');
const followupsRouter = require('./routes/followups');
const analyticsRouter = require('./routes/analytics');
const managerAnalyticsRouter = require('./routes/analytics.manager');
const teamAnalyticsRouter = require('./routes/analytics.admin');
const targetsRouter = require('./routes/targets');


app.use('/api/salestrack/teams', teamsRouter);
app.use('/api/salestrack/contacts', contactsRouter);
app.use('/api/salestrack/opportunities', opportunitiesRouter);
app.use('/api/salestrack/dashboard', dashboardRouter);
app.use('/api/salestrack/reporting', reportingRouter);
app.use('/api/salestrack', invitesRouter);
app.use('/api/salestrack', activitiesRouter);
app.use('/api/salestrack', tasksRouter);
app.use('/api/salestrack', timelineRouter);
app.use('/api/salestrack', followupsRouter);
app.use('/api/salestrack', analyticsRouter);
app.use('/api/salestrack', managerAnalyticsRouter);
app.use('/api/salestrack', teamAnalyticsRouter);
app.use('/api/salestrack', targetsRouter);

// --- Health Check Route ---
app.get('/api/salestrack/health', (req, res) => {
  res.json({ status: 'ok', service: 'salestrack' });
});

// --- Error Handlers (Letak di hujung sekali, sebelum app.listen) ---
// 1. 404 Fallback untuk laluan yang tak wujud
app.use((req, res, next) => {
  res.status(404).json({ error: 'NOT_FOUND', service: 'salestrack' });
});

// 2. Generic Error Handler (tangkap semua ralat lain)
app.use((err, req, res, next) => {
  console.error(err.stack); // Log ralat untuk debugging
  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
});
// --- AKHIR BLOK ERROR HANDLER ---


// --- Server Start ---
const PORT = process.env.SALESTRACK_PORT || 3002;

db.sequelize.authenticate()
  .then(() => {
    console.log('✅ SalesTrack DB connected.');
    app.listen(PORT, () => {
      console.log(`🚀 SalesTrack service running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Unable to connect to the SalesTrack database:', err);
    process.exit(1); // Hentikan aplikasi jika DB gagal sambung
  });