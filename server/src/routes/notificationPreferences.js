import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as notificationController from '../controllers/notificationController.js';

const router = express.Router();

router.use(authenticate);

router.get('/', notificationController.getPreferences);
router.put('/', notificationController.updatePreferences);

export default router;
