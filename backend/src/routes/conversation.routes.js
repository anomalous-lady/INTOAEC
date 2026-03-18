// src/routes/conversation.routes.js
import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  getOrCreateDirect,
  createGroup,
  getMyConversations,
  getConversation,
  updateGroup,
  addParticipants,
  leaveConversation,
  markAsRead,
} from '../controllers/conversation.controller.js';
import { protect, requireApproved } from '../middleware/auth.js';
import validate from '../middleware/validate.js';

const router = Router();

// Conversations are company-only: require JWT + approved status
router.use(protect);
router.use(requireApproved);

router.get('/', getMyConversations);

router.post(
  '/group',
  [
    body('name').trim().notEmpty().withMessage('Group name required').isLength({ max: 100 }),
    body('participantIds').isArray({ min: 1 }).withMessage('At least 1 participant required'),
    body('participantIds.*').isMongoId().withMessage('Invalid participant ID'),
  ],
  validate,
  createGroup
);

router.get(
  '/direct/:userId',
  [param('userId').isMongoId().withMessage('Invalid user ID')],
  validate,
  getOrCreateDirect
);

router.get(
  '/:conversationId',
  [param('conversationId').isMongoId().withMessage('Invalid conversation ID')],
  validate,
  getConversation
);

router.patch(
  '/:conversationId',
  [
    param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
    body('name').optional().trim().isLength({ max: 100 }),
    body('description').optional().trim().isLength({ max: 300 }),
  ],
  validate,
  updateGroup
);

router.post(
  '/:conversationId/participants',
  [
    param('conversationId').isMongoId().withMessage('Invalid conversation ID'),
    body('userIds').isArray({ min: 1 }).withMessage('At least 1 user required'),
    body('userIds.*').isMongoId().withMessage('Invalid user ID'),
  ],
  validate,
  addParticipants
);

router.post(
  '/:conversationId/leave',
  [param('conversationId').isMongoId().withMessage('Invalid conversation ID')],
  validate,
  leaveConversation
);

router.post(
  '/:conversationId/read',
  [param('conversationId').isMongoId().withMessage('Invalid conversation ID')],
  validate,
  markAsRead
);

export default router;
