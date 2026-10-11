import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').optional().trim().isLength({ max: 100 }).withMessage('Name too long'),
  validate
], authController.register);

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
], authController.login);

router.post('/logout', authController.logout);

router.get('/me', authenticate, authController.me);

router.put('/profile', [
  authenticate,
  body('name').optional().trim().isLength({ max: 100 }).withMessage('Name too long'),
  body('avatar').optional().isURL().withMessage('Avatar must be a valid URL'),
  validate
], authController.updateProfile);

router.put('/password', [
  authenticate,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  validate
], authController.updatePassword);

export default router;