// src/routes/user.routes.js
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getUserProfile,
  updateProfile,
  updateAvatar,
  deleteAvatar,
  searchUsers,
  getOnlineUsers,
  deactivateAccount,
} from '../controllers/user.controller.js';
import { protect, requireApproved } from '../middleware/auth.js';
import { uploadAvatar, handleUpload } from '../middleware/upload.js';
import validate from '../middleware/validate.js';

const router = Router();

// All user routes: must be authenticated AND company-approved
router.use(protect);
router.use(requireApproved);

router.get(
  '/search',
  [query('q').trim().notEmpty().withMessage('Search query required')],
  validate,
  searchUsers
);
router.get('/online', getOnlineUsers);

router.get(
  '/:userId',
  [param('userId').isMongoId().withMessage('Invalid user ID')],
  validate,
  getUserProfile
);

router.patch(
  '/me/profile',
  [
    body('displayName').optional().trim().isLength({ max: 50 }).withMessage('Display name too long'),
    body('bio').optional().trim().isLength({ max: 200 }).withMessage('Bio too long'),
  ],
  validate,
  updateProfile
);

router.post('/me/avatar', handleUpload(uploadAvatar), updateAvatar);
router.delete('/me/avatar', deleteAvatar);

router.delete(
  '/me/deactivate',
  [body('password').notEmpty().withMessage('Password required to deactivate')],
  validate,
  deactivateAccount
);

export default router;
