// src/routes/message.routes.js
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  markMessagesRead,
  searchMessages,
} from '../controllers/message.controller.js';
import { protect, requireApproved } from '../middleware/auth.js';
import { uploadFiles, handleUpload } from '../middleware/upload.js';
import validate from '../middleware/validate.js';

const router = Router({ mergeParams: true });

// Messages are company-only: require JWT + approved status
router.use(protect);
router.use(requireApproved);

router.get(
  '/',
  [
    param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  getMessages
);

router.get(
  '/search',
  [
    param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
    query('q').trim().notEmpty().withMessage('Search query required'),
  ],
  validate,
  searchMessages
);

router.post(
  '/',
  handleUpload(uploadFiles),
  [
    param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
    body('content').optional().trim().isLength({ max: 5000 }).withMessage('Message too long'),
    body('messageType')
      .optional()
      .isIn(['text', 'image', 'file', 'audio', 'video'])
      .withMessage('Invalid message type'),
    body('replyTo').optional().isMongoId().withMessage('Invalid reply ID'),
  ],
  validate,
  sendMessage
);

router.patch(
  '/:messageId',
  [
    param('messageId').isMongoId().withMessage('Invalid message ID'),
    body('content').trim().notEmpty().withMessage('Content required').isLength({ max: 5000 }),
  ],
  validate,
  editMessage
);

router.delete(
  '/:messageId',
  [param('messageId').isMongoId().withMessage('Invalid message ID')],
  validate,
  deleteMessage
);

router.post(
  '/:messageId/reactions',
  [
    param('messageId').isMongoId().withMessage('Invalid message ID'),
    body('emoji').trim().notEmpty().withMessage('Emoji required').isLength({ max: 10 }),
  ],
  validate,
  addReaction
);

router.post('/read', markMessagesRead);

export default router;
