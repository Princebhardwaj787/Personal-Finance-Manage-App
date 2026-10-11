import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { FREQUENCIES } from '../utils/recurringCalculator.js';
import * as recurringExpenseController from '../controllers/recurringExpenseController.js';

const router = express.Router();

// Every route requires an authenticated user. Identity always comes from
// req.user.id — userId is never read from the request body.
router.use(authenticate);

const idParam = param('id').isString().notEmpty().withMessage('Recurring expense ID is required');

const statusFilter = query('status')
  .optional()
  .isIn(['active', 'inactive', 'all'])
  .withMessage('Status must be active, inactive or all');

// NOTE: static paths are declared before '/:id' so they are not shadowed.
router.get('/', [statusFilter, validate], recurringExpenseController.listRecurringExpenses);

/**
 * Phase 7 — recurring transaction automation.
 * Static paths are declared before '/:id' so they are never shadowed.
 */
router.post(
  '/process',
  [
    body('asOfDate').optional({ values: 'falsy' }).isISO8601().withMessage('asOfDate must be a valid date'),
    body('maxCatchUp').optional({ values: 'falsy' }).isInt({ min: 1, max: 60 }).withMessage('maxCatchUp must be 1-60'),
    body('dryRun').optional({ values: 'falsy' }).isBoolean().withMessage('dryRun must be a boolean'),
    validate
  ],
  recurringExpenseController.processDue
);

router.get(
  '/summary',
  [query('days').optional({ values: 'falsy' }).isInt({ min: 1, max: 365 }).withMessage('Days must be 1-365'), validate],
  recurringExpenseController.getSummary
);

router.get(
  '/upcoming',
  [
    query('days').optional({ values: 'falsy' }).isInt({ min: 1, max: 365 }).withMessage('Days must be 1-365'),
    query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    validate
  ],
  recurringExpenseController.getUpcoming
);

router.post(
  '/',
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 characters)'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('frequency').isIn(FREQUENCIES).withMessage(`Frequency must be one of: ${FREQUENCIES.join(', ')}`),
    body('nextDueDate').isISO8601().withMessage('Next due date must be a valid date'),
    body('accountId').isString().notEmpty().withMessage('Account ID is required'),
    body('categoryId').isString().notEmpty().withMessage('Category ID is required'),
    body('description').optional({ values: 'null' }).trim().isLength({ max: 500 }).withMessage('Description too long'),
    body('isActive').optional({ values: 'falsy' }).isBoolean().withMessage('isActive must be a boolean'),
    validate
  ],
  recurringExpenseController.createRecurringExpense
);

router.get('/:id', [idParam, validate], recurringExpenseController.getRecurringExpense);

router.get(
  '/:id/occurrences',
  [idParam, query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'), validate],
  recurringExpenseController.getOccurrences
);

router.put(
  '/:id',
  [
    idParam,
    body('name').optional({ values: 'falsy' }).trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('amount').optional({ values: 'falsy' }).isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('frequency').optional({ values: 'falsy' }).isIn(FREQUENCIES).withMessage('Invalid frequency'),
    body('nextDueDate').optional({ values: 'falsy' }).isISO8601().withMessage('Next due date must be a valid date'),
    body('accountId').optional({ values: 'falsy' }).isString().notEmpty().withMessage('Account ID must not be empty'),
    body('categoryId').optional({ values: 'falsy' }).isString().notEmpty().withMessage('Category ID must not be empty'),
    body('description').optional({ values: 'null' }).trim().isLength({ max: 500 }).withMessage('Description too long'),
    body('isActive').optional({ values: 'falsy' }).isBoolean().withMessage('isActive must be a boolean'),
    validate
  ],
  recurringExpenseController.updateRecurringExpense
);

router.delete('/:id', [idParam, validate], recurringExpenseController.deleteRecurringExpense);

export default router;
