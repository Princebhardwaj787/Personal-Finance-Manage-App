import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as categoryController from '../controllers/categoryController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', [
  query('type').optional().isIn(['INCOME', 'EXPENSE']).withMessage('Type must be INCOME or EXPENSE'),
  validate
], categoryController.listCategories);

router.get('/type/:type', [
  param('type').isIn(['INCOME', 'EXPENSE']).withMessage('Type must be INCOME or EXPENSE'),
  validate
], categoryController.listCategoriesByType);

router.get('/:id', [
  param('id').isString().notEmpty().withMessage('Category ID is required'),
  validate
], categoryController.getCategory);

router.post('/', [
  body('name').trim().isLength({ min: 1, max: 50 }).withMessage('Name is required (max 50 characters)'),
  body('type').isIn(['INCOME', 'EXPENSE']).withMessage('Type must be INCOME or EXPENSE'),
  body('icon').optional().isString().withMessage('Icon must be a string'),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex color'),
  validate
], categoryController.createCategoryController);

router.put('/:id', [
  param('id').isString().notEmpty().withMessage('Category ID is required'),
  body('name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Name must be 1-50 characters'),
  body('icon').optional().isString().withMessage('Icon must be a string'),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex color'),
  validate
], categoryController.updateCategoryController);

router.delete('/:id', [
  param('id').isString().notEmpty().withMessage('Category ID is required'),
  validate
], categoryController.deleteCategoryController);

export default router;