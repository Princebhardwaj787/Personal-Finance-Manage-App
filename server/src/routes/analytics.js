import express from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { PERIODS, GRANULARITIES } from '../utils/dateRange.js';
import * as analyticsController from '../controllers/analyticsController.js';

const router = express.Router();

// Every analytics query is scoped to the authenticated user before it runs.
router.use(authenticate);

const periodRules = [
  query('period').optional().isIn(PERIODS).withMessage(`Period must be one of: ${PERIODS.join(', ')}`),
  query('startDate').optional().isISO8601().withMessage('startDate must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('endDate must be a valid date')
];

router.get('/income-expenses', [
  ...periodRules,
  query('granularity').optional().isIn(GRANULARITIES)
    .withMessage(`granularity must be one of: ${GRANULARITIES.join(', ')}`),
  validate
], analyticsController.incomeExpenses);

router.get('/category-spending', periodRules, validate, analyticsController.categorySpending);

router.get('/monthly-trends', [
  query('months').optional().isInt({ min: 6, max: 24 }).withMessage('months must be between 6 and 24'),
  validate
], analyticsController.monthlyTrends);

export default router;
