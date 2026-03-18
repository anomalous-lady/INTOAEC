// src/controllers/upload.controller.js
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AppError, catchAsync } from '../utils/AppError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Upload Files (message attachments) ───────────────────────────────────────
export const uploadFiles = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new AppError('No files uploaded.', 400));
  }

  const files = req.files.map((file) => ({
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    url: `/uploads/files/${file.filename}`,
  }));

  res.status(201).json({ status: 'success', data: { files } });
});

// ── Delete Uploaded File ──────────────────────────────────────────────────────
export const deleteFile = catchAsync(async (req, res, next) => {
  const { filename } = req.params;

  // Prevent path traversal
  const safeName = path.basename(filename);
  const filePath = path.join(__dirname, '../../uploads/files', safeName);

  if (!fs.existsSync(filePath)) {
    return next(new AppError('File not found.', 404));
  }

  fs.unlink(filePath, (err) => {
    if (err) return next(new AppError('Failed to delete file.', 500));
    res.status(200).json({ status: 'success', message: 'File deleted.' });
  });
});
