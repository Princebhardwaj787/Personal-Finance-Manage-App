import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import {
  securityHeaders,
  apiRateLimiter,
  authRateLimiter,
  registerRateLimiter
} from './middleware/security.js';
import { requestLogger } from './middleware/requestLogger.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import categoryRoutes from './routes/categories.js';
import transactionRoutes from './routes/transactions.js';
import transferRoutes from './routes/transfers.js';
import budgetRoutes from './routes/budgets.js';
import savingsGoalRoutes from './routes/savingsGoals.js';
import recurringExpenseRoutes from './routes/recurringExpenses.js';
import dashboardRoutes from './routes/dashboard.js';
import analyticsRoutes from './routes/analytics.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import notificationPreferenceRoutes from './routes/notificationPreferences.js';
import { processScheduledNotifications } from './services/notificationService.js';

const app = express();

// Behind a reverse proxy, trust X-Forwarded-* ONLY when explicitly enabled.
// Otherwise a client could spoof its IP and defeat the rate limiter.
if (config.security.trustProxy) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

// Security headers (CSP, HSTS, no-sniff, frame-ancestors, referrer policy).
app.use(securityHeaders(config));

app.use(cors({
  origin: config.client.url,
  credentials: true,
  // Lets the SPA read the download filename from Content-Disposition (§22).
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Structured, redacted request logging (replaces morgan's dev format).
app.use(requestLogger());

// Global ceiling so one client cannot saturate the database.
app.use('/api', apiRateLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Credential endpoints get the strict brute-force limiter.
app.use('/api/auth/register', registerRateLimiter);
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/password', authRateLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/savings-goals', savingsGoalRoutes);
app.use('/api/recurring-expenses', recurringExpenseRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notification-preferences', notificationPreferenceRoutes);

app.use(notFound);
app.use(errorHandler);

// The app is exported for integration tests, which import it instead of
// starting a real listener. In test mode we never bind a port.
if (config.server.nodeEnv !== 'test') {
  app.listen(config.server.port, () => {
    console.log(`Server running on port ${config.server.port} in ${config.server.nodeEnv} mode`);
  });
}

// ---------------------------------------------------------------------------
// Scheduled notification processor (Phase 9).
//
// Runs the idempotent budget / payment / goal / low-balance checks on an
// in-process interval. Every creation path is deduped by (userId, dedupeKey),
// so overlapping or repeated runs never produce duplicate notifications.
// Disabled automatically under NODE_ENV=test so suites stay deterministic.
// ---------------------------------------------------------------------------
if (config.server.nodeEnv !== 'test') {
  const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  let schedulerRunning = false;

  const runScheduledNotifications = async () => {
    if (schedulerRunning) return; // never overlap runs
    schedulerRunning = true;
    try {
      const result = await processScheduledNotifications();
      if (result.budget + result.upcomingPayments + result.goals + result.lowBalance > 0) {
        console.log(
          `[notifications] created: budget=${result.budget} upcoming=${result.upcomingPayments} ` +
          `goals=${result.goals} lowBalance=${result.lowBalance} (users=${result.usersProcessed})`
        );
      }
    } catch (error) {
      console.error('[notifications] scheduled run failed:', error);
    } finally {
      schedulerRunning = false;
    }
  };

  // First run shortly after boot, then on the interval.
  setTimeout(runScheduledNotifications, 30 * 1000);
  setInterval(runScheduledNotifications, SCHEDULER_INTERVAL_MS);
}

export default app;
