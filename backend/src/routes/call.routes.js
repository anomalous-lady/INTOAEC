// src/routes/call.routes.js
import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  initiateCall,
  joinCall,
  endCall,
  rejectCall,
  getCallHistory,
  getActiveCall,
} from '../controllers/call.controller.js';
import { protect, requireApproved } from '../middleware/auth.js';
import validate from '../middleware/validate.js';

const router = Router();

// Calls are company-only: require JWT + approved status
router.use(protect);
router.use(requireApproved);

router.post(
  '/',
  [
    body('conversationId').isMongoId().withMessage('Invalid conversation ID'),
    body('type').optional().isIn(['audio', 'video']).withMessage('Type must be audio or video'),
  ],
  validate,
  initiateCall
);

router.post(
  '/:roomId/join',
  [param('roomId').isUUID().withMessage('Invalid room ID')],
  validate,
  joinCall
);

router.post(
  '/:roomId/end',
  [
    param('roomId').isUUID().withMessage('Invalid room ID'),
    body('reason').optional().isIn(['normal', 'missed', 'rejected', 'network_error', 'timeout']),
  ],
  validate,
  endCall
);

router.post(
  '/:roomId/reject',
  [param('roomId').isUUID().withMessage('Invalid room ID')],
  validate,
  rejectCall
);

router.get(
  '/history/:conversationId',
  [param('conversationId').isMongoId().withMessage('Invalid conversation ID')],
  validate,
  getCallHistory
);

router.get(
  '/active/:conversationId',
  [param('conversationId').isMongoId().withMessage('Invalid conversation ID')],
  validate,
  getActiveCall
);

export default router;
