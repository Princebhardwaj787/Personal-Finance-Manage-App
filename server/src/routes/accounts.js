import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as accountController from '../controllers/accountController.js';

const router = express.Router();

router.use(authenticate);

const accountTypes = ['CASH', 'BANK', 'UPI_WALLET', 'CREDIT_CARD', 'OTHER'];

router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  validate
], accountController.listAccounts);

router.get('/:id', [
  param('id').isString().notEmpty().withMessage('Account ID is required'),
  validate
], accountController.getAccount);

router.post('/', [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 characters)'),
  body('type').isIn(accountTypes).withMessage('Invalid account type'),
  body('balance').optional().isFloat({ min: 0 }).withMessage('Balance must be a positive number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('icon').optional().isString().withMessage('Icon must be a string'),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex color'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
  body('lowBalanceThreshold').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Low balance threshold must be a non-negative number'),
  validate
], accountController.createAccountController);

router.put('/:id', [
  param('id').isString().notEmpty().withMessage('Account ID is required'),
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
  body('type').optional().isIn(accountTypes).withMessage('Invalid account type'),
  body('icon').optional().isString().withMessage('Icon must be a string'),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex color'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('lowBalanceThreshold').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Low balance threshold must be a non-negative number'),
  validate
], accountController.updateAccountController);

router.delete('/:id', [
  param('id').isString().notEmpty().withMessage('Account ID is required'),
  validate
], accountController.deleteAccountController);

export default router;