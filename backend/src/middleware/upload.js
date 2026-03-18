// src/middleware/upload.js
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/AppError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

// ── SECURITY: MIME → safe extension map ──────────────────────────────────────
// Extension is determined by MIME type, NEVER from client-supplied filename.
// This prevents double-extension attacks like "shell.php.jpg" where the
// attacker controls the extension kept by path.extname().
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'audio/mpeg': '.mp3',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_FILE_MIMES = new Set(Object.keys(MIME_TO_EXT));

// ── Storage engines ───────────────────────────────────────────────────────────
const createStorage = (subdir) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(
        __dirname,
        '../../',
        process.env.UPLOAD_PATH || 'uploads',
        subdir
      );
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      // SECURITY: Extension derived from verified MIME type, not from original filename.
      // UUID prefix ensures no collisions and makes filenames unpredictable.
      const ext = MIME_TO_EXT[file.mimetype] || '.bin';
      cb(null, `${uuidv4()}${ext}`);
    },
  });

// ── File filters ──────────────────────────────────────────────────────────────
const imageFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only image files (JPEG, PNG, GIF, WebP) are allowed.', 400), false);
  }
};

const fileFilter = (req, file, cb) => {
  if (ALLOWED_FILE_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('File type not supported.', 400), false);
  }
};

// ── Multer instances ──────────────────────────────────────────────────────────

export const uploadAvatar = multer({
  storage: createStorage('avatars'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for avatars
  fileFilter: imageFilter,
}).single('avatar');

export const uploadFiles = multer({
  storage: createStorage('files'),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
  fileFilter,
}).array('files', 5);

export const uploadSingle = multer({
  storage: createStorage('files'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
}).single('file');

// ── Wrapper that converts Multer cb errors to AppErrors ──────────────────────
export const handleUpload = (multerMiddleware) => {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError(`File too large. Max size is ${process.env.MAX_FILE_SIZE_MB || 10}MB.`, 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new AppError('Too many files. Maximum 5 files per upload.', 400));
        }
        return next(new AppError(err.message, 400));
      }
      next(err);
    });
  };
};
