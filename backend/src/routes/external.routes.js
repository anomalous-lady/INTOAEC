// src/routes/external.routes.js
import { Router } from 'express';
import { body, param } from 'express-validator';
import { handleWebhook, verifyWebhook, sendExternalMessage } from '../controllers/external.controller.js';
import validate from '../middleware/validate.js';

const router = Router();

router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhook);

router.post(
  '/conversations/:conversationId/messages',
  [
    param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
    body('content').trim().notEmpty().withMessage('Message content required'),
    body('messageType').optional().isIn(['text', 'image', 'video', 'audio', 'file']),
  ],
  validate,
  sendExternalMessage
);

export default router;