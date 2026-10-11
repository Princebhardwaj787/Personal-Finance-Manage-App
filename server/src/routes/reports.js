import express from 'express';
import { param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { PERIODS } from '../utils/dateRange.js';
import { REPORT_TYPES } from '../services/reportService.js';
import * as reportController from '../controllers/reportController.js';

const router = express.Router();

// Every report endpoint is scoped to the authenticated user before it runs.
router.use(authenticate);

const typeMessage = `type must be one of: ${REPORT_TYPES.join(', ')}`;
const transactionTypes = ['INCOME', 'EXPENSE'];
const typeFilterMessage = 'type must be INCOME or EXPENSE (transfers are created via /api/transfers)';

/**
 * `.optional({ values: 'falsy' })` is deliberate (Phase 7 lesson): the UI
 * sends every filter key and uses '' for "not set", which must be treated as
 * an absent filter rather than a validation error.
 */
const periodRules = [
  query('period').optional({ values: 'falsy' }).isIn(PERIODS)
    .withMessage(`period must be one of: ${PERIODS.join(', ')}`),
  query('startDate').optional({ values: 'falsy' }).isISO8601().withMessage('startDate must be a valid date'),
  query('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('endDate must be a valid date')
];

const filterRules = [
  query('accountId').optional({ values: 'falsy' }).isString().withMessage('Invalid account ID'),
  query('categoryId').optional({ values: 'falsy' }).isString().withMessage('Invalid category ID'),
  query('type').optional({ values: 'falsy' }).isIn(transactionTypes).withMessage(typeFilterMessage),
  query('minAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('minAmount must be a non-negative number'),
  query('maxAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('maxAmount must be a non-negative number'),
  query('search').optional({ values: 'falsy' }).isLength({ max: 200 }).withMessage('Search must be 200 characters or fewer')
];

const typeParam = param('type').isIn(REPORT_TYPES).withMessage(typeMessage);

// Static paths first so they are never shadowed by '/:type'.
router.get('/history', [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  validate
], reportController.getReportHistory);

router.get('/:type', [
  typeParam,
  ...periodRules,
  ...filterRules,
  validate
], reportController.getReport);

router.get('/:type/export', [
  typeParam,
  query('format').isIn(['csv', 'pdf']).withMessage('format must be csv or pdf'),
  ...periodRules,
  ...filterRules,
  validate
], reportController.exportReport);

export default router;
