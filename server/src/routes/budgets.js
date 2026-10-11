import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as budgetController from '../controllers/budgetController.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/',
  [
    query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    query('year').optional().isInt({ min: 2020 }).withMessage('Year must be at least 2020'),
    validate
  ],
  budgetController.listBudgets
);

router.post(
  '/',
  [
    body('categoryId').notEmpty().withMessage('Category ID is required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year').isInt({ min: 2020 }).withMessage('Year must be at least 2020'),
    validate
  ],
  budgetController.createBudget
);

router.get(
  '/current-month',
  [
    query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    query('year').optional().isInt({ min: 2020 }).withMessage('Year must be at least 2020'),
    validate
  ],
  budgetController.getCurrentMonthBudgets
);

router.get(
  '/:id',
  [
    param('id').isString().notEmpty().withMessage('Budget ID is required'),
    validate
  ],
  budgetController.getBudget
);

router.put(
  '/:id',
  [
    param('id').isString().notEmpty().withMessage('Budget ID is required'),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    body('categoryId').optional().notEmpty().withMessage('Category ID must not be empty if provided'),
    body('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year').optional().isInt({ min: 2020 }).withMessage('Year must be at least 2020'),
    validate
  ],
  budgetController.updateBudget
);

router.delete(
  '/:id',
  [
    param('id').isString().notEmpty().withMessage('Budget ID is required'),
    validate
  ],
  budgetController.deleteBudget
);

export default router;