// src/controllers/user.controller.js
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import { AppError, catchAsync } from '../utils/AppError.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import logger from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Get User Profile (public) ─────────────────────────────────────────────────
// SECURITY: uses sanitizeUser(user, true) — public shape only.
// Never returns email, role, status, or any internal fields.
export const getUserProfile = catchAsync(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.params.userId,
    isActive: true,
    status: 'approved',      // SECURITY: pending/suspended users are invisible
  }).select('employeeId username displayName avatar bio isOnline lastSeen');

  if (!user) return next(new AppError('User not found.', 404));

  res.status(200).json({ status: 'success', data: { user: sanitizeUser(user, true) } });
});

// ── Update Profile ────────────────────────────────────────────────────────────
export const updateProfile = catchAsync(async (req, res, next) => {
  const { displayName, bio } = req.body;

  if (req.body.password || req.body.email || req.body.role || req.body.status) {
    return next(new AppError('Use dedicated routes to update sensitive account fields.', 400));
  }

  const updates = {};
  if (displayName !== undefined) updates.displayName = displayName;
  if (bio !== undefined) updates.bio = bio;

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  // SECURITY: return self-profile shape (includes email/status for own view)
  res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
});

// ── Upload / Update Avatar ────────────────────────────────────────────────────
export const updateAvatar = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please upload an image.', 400));

  const outputFilename = `avatar-${req.user._id}-${Date.now()}.webp`;
  const outputPath = path.join(
    __dirname, '../../', process.env.UPLOAD_PATH || 'uploads', 'avatars', outputFilename
  );

  await sharp(req.file.path)
    .resize(200, 200, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80 })
    .toFile(outputPath);

  fs.unlink(req.file.path, (err) => {
    if (err) logger.warn(`Failed to delete temp file: ${req.file.path}`);
  });

  const oldUser = await User.findById(req.user._id);
  if (oldUser.avatar) {
    const oldPath = path.join(__dirname, '../../uploads/avatars', path.basename(oldUser.avatar));
    fs.unlink(oldPath, () => {});
  }

  const avatarUrl = `/uploads/avatars/${outputFilename}`;
  const user = await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl }, { new: true });

  res.status(200).json({ status: 'success', data: { user: sanitizeUser(user) } });
});

// ── Delete Avatar ─────────────────────────────────────────────────────────────
export const deleteAvatar = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (!user.avatar) return next(new AppError('No avatar to delete.', 400));

  const avatarPath = path.join(__dirname, '../../uploads/avatars', path.basename(user.avatar));
  fs.unlink(avatarPath, () => {});
  await User.findByIdAndUpdate(req.user._id, { avatar: null });

  res.status(200).json({ status: 'success', message: 'Avatar removed.' });
});

// ── Search Users ──────────────────────────────────────────────────────────────
// SECURITY: only returns approved, active users. Strips all sensitive fields.
export const searchUsers = catchAsync(async (req, res, next) => {
  const { q, page = 1, limit = 20 } = req.query;

  if (!q || q.trim().length < 2) {
    return next(new AppError('Search query must be at least 2 characters.', 400));
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const safeLimit = Math.min(parseInt(limit), 50);
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  // SECURITY: explicitly project only safe public fields in the query itself
  // so even if sanitizeUser logic changed, the DB never returns sensitive data
  const users = await User.find({
    $or: [{ username: regex }, { displayName: regex }, { employeeId: regex }],
    isActive: true,
    status: 'approved',   // SECURITY: pending/suspended invisible in search
    _id: { $ne: req.user._id },
  })
    .select('employeeId username displayName avatar bio isOnline lastSeen')
    .skip(skip)
    .limit(safeLimit)
    .lean();

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users },
  });
});

// ── Get Online Users ──────────────────────────────────────────────────────────
export const getOnlineUsers = catchAsync(async (req, res) => {
  const users = await User.find({
    isOnline: true,
    isActive: true,
    status: 'approved',
    _id: { $ne: req.user._id },
  })
    .select('username displayName avatar isOnline lastSeen')
    .lean();

  res.status(200).json({ status: 'success', data: { users } });
});

// ── Deactivate Own Account ────────────────────────────────────────────────────
export const deactivateAccount = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await user.comparePassword(req.body.password);
  if (!isMatch) return next(new AppError('Password is incorrect.', 401));

  await User.findByIdAndUpdate(req.user._id, { isActive: false, refreshTokens: [] });

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  res.status(200).json({ status: 'success', message: 'Account deactivated.' });
});
