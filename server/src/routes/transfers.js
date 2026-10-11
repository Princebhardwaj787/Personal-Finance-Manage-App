import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as transferController from '../controllers/transferController.js';

const router = express.Router();

// Identity always comes from req.user.id — never from the request body.
router.use(authenticate);

const idParam = param('id').isString().notEmpty().withMessage('Transfer ID is required');

const transferRules = [
  body('fromAccountId').isString().notEmpty().withMessage('From account ID is required'),
  body('toAccountId').isString().notEmpty().withMessage('To account ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Date must be a valid date'),
  body('description').optional({ values: 'null' }).trim().isLength({ max: 500 }).withMessage('Description too long')
];

// Static paths before '/:id'.
router.get('/', [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('startDate').optional({ values: 'falsy' }).isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('End date must be a valid date'),
  query('accountId').optional({ values: 'falsy' }).isString().withMessage('Invalid account ID'),
  query('search').optional({ values: 'falsy' }).isLength({ max: 200 }).withMessage('Search must be 200 characters or fewer'),
  query('sortBy').optional({ values: 'falsy' }).isIn(['date', 'amount', 'createdAt']).withMessage('Invalid sort field'),
  query('sortOrder').optional({ values: 'falsy' }).isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  validate
], transferController.listTransfers);

router.get('/summary', [
  query('startDate').optional({ values: 'falsy' }).isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional({ values: 'falsy' }).isISO8601().withMessage('End date must be a valid date'),
  validate
], transferController.getSummary);

router.post('/', transferRules, validate, transferController.createTransfer);

router.get('/:id', [idParam, validate], transferController.getTransfer);

const updateRules = [
  body('fromAccountId').optional({ values: 'falsy' }).isString().notEmpty().withMessage('From account ID must not be empty'),
  body('toAccountId').optional({ values: 'falsy' }).isString().notEmpty().withMessage('To account ID must not be empty'),
  body('amount').optional({ values: 'falsy' }).isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Date must be a valid date'),
  body('description').optional({ values: 'null' }).trim().isLength({ max: 500 }).withMessage('Description too long')
];

router.put('/:id', [idParam, ...updateRules, validate], transferController.updateTransfer);

router.delete('/:id', [idParam, validate], transferController.deleteTransfer);

export default router;
