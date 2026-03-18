// src/controllers/admin.controller.js
import crypto from 'crypto';
import Invitation from '../models/Invitation.js';
import User from '../models/User.js';
import { AppError, catchAsync } from '../utils/AppError.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import { sendInvitationEmail } from '../utils/email.js';
import logger from '../config/logger.js';

// ── Invitations ───────────────────────────────────────────────────────────────

export const createInvitation = catchAsync(async (req, res, next) => {
  const { email, role = 'user', note = '' } = req.body;

  // Block inviting an already-registered email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('A user with that email already exists.', 409));
  }

  // Revoke any existing pending invite for this email before creating a new one
  await Invitation.updateMany(
    { email, status: 'pending' },
    { status: 'revoked' }
  );

  const { plain, hash } = Invitation.generateToken();

  const invitation = await Invitation.create({
    email,
    token: plain,       // stored for the email send, never returned in API responses
    tokenHash: hash,    // stored permanently for verification
    invitedBy: req.user._id,
    role,
    note,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  // Send invite email — non-blocking but log failures
  try {
    await sendInvitationEmail({ email, inviterName: req.user.displayName || req.user.username }, plain);
  } catch (err) {
    logger.warn(`Invite email failed for ${email}: ${err.message}`);
    // Don't block — admin can share the link manually
  }

  logger.info(`Invitation created by [uid:${req.user._id}] for ${email}`);

  // SECURITY: never return the plain token in the API response.
  // It was sent via email. The response only confirms success.
  res.status(201).json({
    status: 'success',
    message: `Invitation sent to ${email}.`,
    data: { invitation },
  });
});

export const listInvitations = catchAsync(async (req, res) => {
  const { status = 'all', page = 1, limit = 30 } = req.query;
  const query = status !== 'all' ? { status } : {};

  const invitations = await Invitation.find(query)
    .populate('invitedBy', 'username displayName')
    .populate('acceptedBy', 'username displayName')
    .sort({ createdAt: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  res.status(200).json({
    status: 'success',
    results: invitations.length,
    data: { invitations },
  });
});

export const revokeInvitation = catchAsync(async (req, res, next) => {
  const invitation = await Invitation.findById(req.params.invitationId);
  if (!invitation) return next(new AppError('Invitation not found.', 404));
  if (invitation.status !== 'pending') {
    return next(new AppError('Only pending invitations can be revoked.', 400));
  }

  invitation.status = 'revoked';
  await invitation.save();

  logger.info(`Invitation ${invitation._id} revoked by [uid:${req.user._id}]`);
  res.status(200).json({ status: 'success', message: 'Invitation revoked.' });
});

// ── User management ───────────────────────────────────────────────────────────

export const listUsers = catchAsync(async (req, res) => {
  const { status = 'all', page = 1, limit = 30 } = req.query;
  const query = status !== 'all' ? { status } : {};

  const users = await User.find(query)
    .select('employeeId username displayName email avatar role status isEmailVerified isOnline lastSeen createdAt')
    .sort({ createdAt: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users },
  });
});

export const approveUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.userId);
  if (!user) return next(new AppError('User not found.', 404));

  if (user.status === 'approved') {
    return next(new AppError('User is already approved.', 400));
  }
  if (user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot approve yourself.', 400));
  }

  user.status = 'approved';
  await user.save({ validateBeforeSave: false });

  logger.info(`User [uid:${user._id}] approved by admin [uid:${req.user._id}]`);

  res.status(200).json({
    status: 'success',
    message: `${user.username} approved.`,
    data: { user: sanitizeUser(user) },
  });
});

export const suspendUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.userId).select('+refreshTokens');
  if (!user) return next(new AppError('User not found.', 404));

  if (user.role === 'admin') {
    return next(new AppError('Admin accounts cannot be suspended through the API.', 403));
  }
  if (user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot suspend yourself.', 400));
  }

  user.status = 'suspended';
  user.refreshTokens = []; // Immediately invalidate all sessions
  await user.save({ validateBeforeSave: false });

  logger.warn(`User [uid:${user._id}] suspended by admin [uid:${req.user._id}]`);

  res.status(200).json({
    status: 'success',
    message: `${user.username} suspended and all sessions invalidated.`,
  });
});

export const changeUserRole = catchAsync(async (req, res, next) => {
  const { role } = req.body;
  const ALLOWED_ROLES = ['user', 'moderator', 'admin'];

  if (!ALLOWED_ROLES.includes(role)) {
    return next(new AppError('Invalid role.', 400));
  }
  if (req.params.userId === req.user._id.toString()) {
    return next(new AppError('You cannot change your own role.', 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { role },
    { new: true, runValidators: true }
  ).select('username displayName role status');

  if (!user) return next(new AppError('User not found.', 404));

  logger.info(`Role of [uid:${user._id}] changed to '${role}' by [uid:${req.user._id}]`);

  res.status(200).json({
    status: 'success',
    data: { user },
  });
});

export const getPendingUsers = catchAsync(async (req, res) => {
  const users = await User.find({ status: 'pending' })
    .select('username displayName email avatar isEmailVerified createdAt')
    .sort({ createdAt: 1 }) // Oldest first — approve in order
    .lean();

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: { users },
  });
});
