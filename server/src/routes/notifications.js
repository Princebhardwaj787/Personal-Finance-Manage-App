import express from 'express';
import { param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as notificationController from '../controllers/notificationController.js';

const router = express.Router();

// Every notification endpoint is scoped to the authenticated user before it
// runs — the service never trusts a userId from the request body.
router.use(authenticate);

// Static paths first so they are never shadowed by '/:id'.
router.get('/unread-count', notificationController.unreadCount);

router.get('/', [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  validate
], notificationController.list);

// Manual refresh of the scheduled checks for the CURRENT user only.
// Idempotent by design; there is no endpoint to process other users.
router.post('/process', notificationController.process);

router.patch('/read-all', notificationController.markAllRead);

const idParam = param('id').isString().withMessage('Invalid notification ID');

router.patch('/:id/read', [idParam, validate], notificationController.markRead);

router.delete('/:id', [idParam, validate], notificationController.remove);

export default router;
