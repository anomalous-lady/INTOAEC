// src/controllers/auth.controller.js
import crypto from 'crypto';
import User from '../models/User.js';
import Invitation from '../models/Invitation.js';
import { AppError, catchAsync } from '../utils/AppError.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  setCookies,
  clearCookies,
} from '../utils/jwt.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import logger from '../config/logger.js';

// ── Register (invite-only) ────────────────────────────────────────────────────
export const register = catchAsync(async (req, res, next) => {
  const { username, email, password, displayName, inviteToken } = req.body;

  // SECURITY: invite token is mandatory — no self-registration
  if (!inviteToken) {
    return next(new AppError('An invitation token is required to register.', 403));
  }

  // Verify the invitation
  const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
  const invitation = await Invitation.findOne({
    tokenHash,
    status: 'pending',
    expiresAt: { $gt: Date.now() },
  });

  if (!invitation) {
    return next(new AppError('Invitation is invalid, expired, or already used.', 403));
  }

  // SECURITY: the invite email must match the registration email
  if (invitation.email.toLowerCase() !== email.toLowerCase()) {
    return next(new AppError('This invitation was issued to a different email address.', 403));
  }

  // Check for duplicate username or email
  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    const field = existing.email === email.toLowerCase() ? 'email' : 'username';
    return next(new AppError(`That ${field} is already in use.`, 409));
  }

  // Create user — status defaults to 'approved' if admin-invited,
  // 'pending' otherwise (admin must manually approve)
  const user = await User.create({
    username,
    email,
    password,
    displayName: displayName || username,
    role: invitation.role,
    status: 'approved',   // invited users are pre-approved by the admin who sent the invite
    invitedBy: invitation.invitedBy,
  });

  // Consume the invitation
  invitation.status = 'accepted';
  invitation.acceptedAt = new Date();
  invitation.acceptedBy = user._id;
  await invitation.save();

  // Send verification email (non-blocking)
  try {
    const verifyToken = user.createEmailVerificationToken();
    await user.save({ validateBeforeSave: false });
    await sendVerificationEmail(user, verifyToken);
  } catch (err) {
    logger.warn(`Verification email failed for [uid:${user._id}]: ${err.message}`);
  }

  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  user.refreshTokens = [hashToken(refreshToken)];
  await user.save({ validateBeforeSave: false });

  setCookies(res, accessToken, refreshToken);

  logger.info(`New user registered via invite: [uid:${user._id}]`);

  res.status(201).json({
    status: 'success',
    message: 'Account created. Check your email to verify.',
    // SECURITY: use sanitizeUser — only return safe self-profile fields
    data: { user: sanitizeUser(user), accessToken },
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select(
    '+password +refreshTokens +loginAttempts +lockUntil'
  );

  if (!user) return next(new AppError('Invalid email or password.', 401));

  if (user.isLocked()) {
    return next(new AppError('Account temporarily locked due to too many failed attempts. Try again in 2 hours.', 423));
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await user.incrementLoginAttempts();
    return next(new AppError('Invalid email or password.', 401));
  }

  if (!user.isActive) return next(new AppError('Account deactivated. Contact support.', 403));

  // SECURITY: suspended users cannot log in
  if (user.status === 'suspended') {
    return next(new AppError('Your account has been suspended. Contact your administrator.', 403));
  }

  await user.resetLoginAttempts();

  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  const hashed = hashToken(refreshToken);
  user.refreshTokens = [...(user.refreshTokens || []).slice(-4), hashed];
  await user.save({ validateBeforeSave: false });

  setCookies(res, accessToken, refreshToken);

  logger.info(`User logged in: [uid:${user._id}]`);

  res.status(200).json({
    status: 'success',
    data: { user: sanitizeUser(user), accessToken },
  });
});

// ── Refresh Token ─────────────────────────────────────────────────────────────
export const refreshToken = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) return next(new AppError('Refresh token required.', 401));

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    return next(new AppError('Invalid or expired refresh token.', 401));
  }

  const user = await User.findById(decoded.id).select('+refreshTokens');
  if (!user) return next(new AppError('User not found.', 401));

  // SECURITY: suspended users cannot refresh — kicks them out immediately
  if (user.status === 'suspended') {
    clearCookies(res);
    return next(new AppError('Your account has been suspended.', 403));
  }

  const hashed = hashToken(token);
  const tokenIndex = user.refreshTokens.indexOf(hashed);

  if (tokenIndex === -1) {
    // Token reuse detected — invalidate ALL sessions
    user.refreshTokens = [];
    await user.save({ validateBeforeSave: false });
    logger.warn(`Refresh token reuse detected for [uid:${user._id}]. All sessions invalidated.`);
    return next(new AppError('Security alert: session invalidated. Please log in again.', 401));
  }

  const newAccessToken = signAccessToken(user._id);
  const newRefreshToken = signRefreshToken(user._id);

  user.refreshTokens[tokenIndex] = hashToken(newRefreshToken);
  await user.save({ validateBeforeSave: false });

  setCookies(res, newAccessToken, newRefreshToken);

  res.status(200).json({
    status: 'success',
    data: { accessToken: newAccessToken },
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
export const logout = catchAsync(async (req, res, next) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (token && req.user) {
    const hashed = hashToken(token);
    req.user.refreshTokens = (req.user.refreshTokens || []).filter((t) => t !== hashed);
    await User.findByIdAndUpdate(req.user._id, { refreshTokens: req.user.refreshTokens });
  }

  clearCookies(res);
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
});

export const logoutAll = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user._id, { refreshTokens: [] });
  clearCookies(res);
  res.status(200).json({ status: 'success', message: 'Logged out from all devices.' });
});

// ── Verify Email ──────────────────────────────────────────────────────────────
export const verifyEmail = catchAsync(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) return next(new AppError('Token is invalid or has expired.', 400));

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({ status: 'success', message: 'Email verified successfully.' });
});

// ── Forgot Password ───────────────────────────────────────────────────────────
export const forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  // Always return success to prevent email enumeration
  if (!user) {
    return res.status(200).json({
      status: 'success',
      message: 'If that email is registered, a reset link has been sent.',
    });
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    await sendPasswordResetEmail(user, resetToken);
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new AppError('Failed to send reset email. Please try again.', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'If that email is registered, a reset link has been sent.',
  });
});

// ── Reset Password ────────────────────────────────────────────────────────────
export const resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires +refreshTokens');

  if (!user) return next(new AppError('Token is invalid or has expired.', 400));

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = [];
  await user.save();

  res.status(200).json({ status: 'success', message: 'Password reset successfully. Please log in.' });
});

// ── Change Password ───────────────────────────────────────────────────────────
export const changePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('+password +refreshTokens');

  const isMatch = await user.comparePassword(req.body.currentPassword);
  if (!isMatch) return next(new AppError('Current password is incorrect.', 401));

  user.password = req.body.newPassword;
  user.refreshTokens = [];
  await user.save();

  clearCookies(res);
  res.status(200).json({ status: 'success', message: 'Password changed. Please log in again.' });
});

// ── Get Current User ──────────────────────────────────────────────────────────
export const getMe = catchAsync(async (req, res) => {
  // SECURITY: always go through sanitizeUser — never return req.user directly
  res.status(200).json({ status: 'success', data: { user: sanitizeUser(req.user) } });
});
