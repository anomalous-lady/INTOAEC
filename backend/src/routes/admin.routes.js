// src/routes/admin.routes.js
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  listUsers,
  approveUser,
  suspendUser,
  changeUserRole,
  getPendingUsers,
} from '../controllers/admin.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import validate from '../middleware/validate.js';

const router = Router();

// ALL admin routes require: valid JWT + role === 'admin'
router.use(protect);
router.use(restrictTo('admin'));

// ── Invitations ───────────────────────────────────────────────────────────────
router.post(
  '/invitations',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('role')
      .optional()
      .isIn(['user', 'moderator', 'admin'])
      .withMessage('Invalid role'),
    body('note').optional().trim().isLength({ max: 200 }),
  ],
  validate,
  createInvitation
);

router.get(
  '/invitations',
  [
    query('status')
      .optional()
      .isIn(['all', 'pending', 'accepted', 'expired', 'revoked'])
      .withMessage('Invalid status filter'),
  ],
  validate,
  listInvitations
);

router.delete(
  '/invitations/:invitationId',
  [param('invitationId').isMongoId().withMessage('Invalid invitation ID')],
  validate,
  revokeInvitation
);

// ── User management ───────────────────────────────────────────────────────────
router.get(
  '/users',
  [
    query('status')
      .optional()
      .isIn(['all', 'pending', 'approved', 'suspended'])
      .withMessage('Invalid status filter'),
  ],
  validate,
  listUsers
);

router.get('/users/pending', getPendingUsers);

router.patch(
  '/users/:userId/approve',
  [param('userId').isMongoId().withMessage('Invalid user ID')],
  validate,
  approveUser
);

router.patch(
  '/users/:userId/suspend',
  [param('userId').isMongoId().withMessage('Invalid user ID')],
  validate,
  suspendUser
);

router.patch(
  '/users/:userId/role',
  [
    param('userId').isMongoId().withMessage('Invalid user ID'),
    body('role')
      .isIn(['user', 'moderator', 'admin'])
      .withMessage('Role must be user, moderator, or admin'),
  ],
  validate,
  changeUserRole
);

export default router;
