import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as transactionController from '../controllers/transactionController.js';

const router = express.Router();

router.use(authenticate);

/**
 * Phase 7: transactions are only INCOME or EXPENSE. Transfers live in their
 * own table (/api/transfers) so they can never be counted as income/expense.
 *
 * `.optional({ values: 'falsy' })` is deliberate: the UI sends every filter
 * key and uses '' for "not set" (e.g. `?type=&startDate=`), which must be
 * treated as an absent filter rather than a validation error.
 */
const transactionTypes = ['INCOME', 'EXPENSE'];
const typeMessage = 'type must be INCOME or EXPENSE (transfers are created via /api/transfers)';

const idParam = param('id').isString().notEmpty().withMessage('Transaction ID is required');

const dateRangeRules = [
  query('startDate').optional({ values: 'falsy' }).isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('End date must be a valid date')
];

const amountRangeRules = [
  query('minAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('minAmount must be a non-negative number'),
  query('maxAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('maxAmount must be a non-negative number')
];

const textRules = [
  body('description').optional({ values: 'null' }).trim().isLength({ max: 500 }).withMessage('Description too long'),
  body('notes').optional({ values: 'null' }).trim().isLength({ max: 2000 }).withMessage('Notes too long (max 2000)'),
  body('reference').optional({ values: 'null' }).trim().isLength({ max: 100 }).withMessage('Reference too long (max 100)')
];

// Static paths first so they are never shadowed by '/:id'.
router.get('/', [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional({ values: 'falsy' }).isIn(transactionTypes).withMessage(typeMessage),
  query('accountId').optional({ values: 'falsy' }).isString().withMessage('Invalid account ID'),
  query('categoryId').optional({ values: 'falsy' }).isString().withMessage('Invalid category ID'),
  ...dateRangeRules,
  ...amountRangeRules,
  query('search').optional({ values: 'falsy' }).isLength({ max: 200 }).withMessage('Search must be 200 characters or fewer'),
  query('sortBy').optional({ values: 'falsy' }).isIn(['date', 'amount', 'createdAt']).withMessage('Invalid sort field'),
  query('sortOrder').optional({ values: 'falsy' }).isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  validate
], transactionController.listTransactions);

router.get('/summary', [
  query('type').optional({ values: 'falsy' }).isIn(transactionTypes).withMessage(typeMessage),
  query('accountId').optional({ values: 'falsy' }).isString().withMessage('Invalid account ID'),
  query('categoryId').optional({ values: 'falsy' }).isString().withMessage('Invalid category ID'),
  ...dateRangeRules,
  ...amountRangeRules,
  query('search').optional({ values: 'falsy' }).isLength({ max: 200 }).withMessage('Search must be 200 characters or fewer'),
  validate
], transactionController.getSummary);

router.get('/category-breakdown', [
  ...dateRangeRules,
  query('type').optional({ values: 'falsy' }).isIn(transactionTypes).withMessage(typeMessage),
  validate
], transactionController.getCategoryBreakdown);

router.post('/bulk-delete', [
  body('ids').isArray({ min: 1, max: 200 }).withMessage('ids must be an array of 1 to 200 transaction ids'),
  body('ids.*').isString().notEmpty().withMessage('Each id must be a non-empty string'),
  validate
], transactionController.bulkDeleteTransactionsController);

/** LEGACY transfer path — now delegates to the transfer service. */
router.post('/transfer', [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  ...textRules,
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Date must be a valid date'),
  body('fromAccountId').isString().notEmpty().withMessage('From account ID is required'),
  body('toAccountId').isString().notEmpty().withMessage('To account ID is required'),
  validate
], transactionController.createTransferController);

router.get('/:id', [idParam, validate], transactionController.getTransaction);

router.post('/:id/duplicate', [
  idParam,
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Date must be a valid date'),
  validate
], transactionController.duplicateTransactionController);

router.post('/', [
  body('type').isIn(transactionTypes).withMessage(typeMessage),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  ...textRules,
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Date must be a valid date'),
  body('accountId').isString().notEmpty().withMessage('Account ID is required'),
  body('categoryId').optional({ values: 'null' }).isString().withMessage('Invalid category ID'),
  validate
], transactionController.createTransactionController);

router.put('/:id', [
  idParam,
  body('type').optional({ values: 'falsy' }).isIn(transactionTypes).withMessage(typeMessage),
  body('amount').optional({ values: 'falsy' }).isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  ...textRules,
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Date must be a valid date'),
  body('accountId').optional({ values: 'falsy' }).isString().withMessage('Invalid account ID'),
  body('categoryId').optional({ values: 'null' }).isString().withMessage('Invalid category ID'),
  validate
], transactionController.updateTransactionController);

router.delete('/:id', [idParam, validate], transactionController.deleteTransactionController);

export default router;
