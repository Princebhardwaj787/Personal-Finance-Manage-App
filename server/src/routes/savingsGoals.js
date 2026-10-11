import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { GOAL_STATUSES } from '../utils/goalCalculator.js';
import * as savingsGoalController from '../controllers/savingsGoalController.js';

const router = express.Router();

// Every savings-goals route requires an authenticated user. Identity always
// comes from req.user.id — userId is never read from the request body.
router.use(authenticate);

const idParam = param('id').isString().notEmpty().withMessage('Goal ID is required');

// NOTE: '/summary' must be declared before '/:id' or it is shadowed.
router.get(
  '/',
  [
    query('status').optional().isIn(GOAL_STATUSES).withMessage('Invalid status filter'),
    validate
  ],
  savingsGoalController.listGoals
);

router.get(
  '/summary',
  savingsGoalController.getSummary
);

router.post(
  '/',
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 characters)'),
    body('targetAmount').isFloat({ gt: 0 }).withMessage('Target amount must be greater than 0'),
    body('currentAmount').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Current amount must not be negative'),
    body('targetDate').isISO8601().withMessage('Target date must be a valid date'),
    body('description').optional({ values: 'null' }).trim().isLength({ max: 500 }).withMessage('Description too long'),
    validate
  ],
  savingsGoalController.createGoal
);

router.get(
  '/:id',
  [idParam, validate],
  savingsGoalController.getGoal
);

router.put(
  '/:id',
  [
    idParam,
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('targetAmount').optional().isFloat({ gt: 0 }).withMessage('Target amount must be greater than 0'),
    body('targetDate').optional().isISO8601().withMessage('Target date must be a valid date'),
    body('status').optional().isIn(GOAL_STATUSES).withMessage('Invalid status'),
    body('description').optional({ values: 'null' }).trim().isLength({ max: 500 }).withMessage('Description too long'),
    validate
  ],
  savingsGoalController.updateGoal
);

router.delete(
  '/:id',
  [idParam, validate],
  savingsGoalController.deleteGoal
);

router.post(
  '/:id/contributions',
  [
    idParam,
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('note').optional({ values: 'null' }).trim().isLength({ max: 300 }).withMessage('Note too long'),
    body('date').optional().isISO8601().withMessage('Date must be a valid date'),
    validate
  ],
  savingsGoalController.addContribution
);

router.get(
  '/:id/contributions',
  [
    idParam,
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    validate
  ],
  savingsGoalController.listContributions
);

export default router;
