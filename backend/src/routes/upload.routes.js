// src/routes/upload.routes.js
import { Router } from 'express';
import { param } from 'express-validator';
import { uploadFiles as uploadFilesCtrl, deleteFile } from '../controllers/upload.controller.js';
import { protect, requireApproved } from '../middleware/auth.js';
import { uploadFiles, handleUpload } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import validate from '../middleware/validate.js';

const router = Router();

// Uploads are company-only: require JWT + approved status
router.use(protect);
router.use(requireApproved);

router.post('/', uploadLimiter, handleUpload(uploadFiles), uploadFilesCtrl);

router.delete(
  '/:filename',
  [param('filename').trim().notEmpty().withMessage('Filename required')],
  validate,
  deleteFile
);

export default router;
