import express from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { PERIODS } from '../utils/dateRange.js';
import * as dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

router.use(authenticate);

const periodRules = [
  query('period').optional().isIn(PERIODS).withMessage(`Period must be one of: ${PERIODS.join(', ')}`),
  query('startDate').optional().isISO8601().withMessage('startDate must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('endDate must be a valid date')
];

router.get('/summary', periodRules, validate, dashboardController.getSummary);

router.get(
  '/widgets',
  [
    query('transactionLimit').optional().isInt({ min: 1, max: 20 }),
    query('goalLimit').optional().isInt({ min: 1, max: 20 }),
    query('upcomingLimit').optional().isInt({ min: 1, max: 20 }),
    validate
  ],
  dashboardController.getWidgets
);

router.get(
  '/budget-overview',
  [
    ...periodRules,
    query('month').optional().isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12'),
    query('year').optional().isInt({ min: 1900, max: 2999 }).withMessage('year must be a valid year'),
    validate
  ],
  dashboardController.getBudgetOverviewController
);

router.get(
  '/recent-transactions',
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    validate
  ],
  dashboardController.getRecentTransactions
);

export default router;
