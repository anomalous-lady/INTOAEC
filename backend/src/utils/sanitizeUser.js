// src/utils/sanitizeUser.js
// ─────────────────────────────────────────────────────────────────────────────
//  Single source of truth for what user data is safe to send to clients.
//
//  TWO shapes:
//    sanitizeUser(user)       → full self-profile (returned to the logged-in user)
//    sanitizeUser(user, true) → public profile (returned when viewing someone else)
//
//  Never construct user response objects inline — always go through here.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full self-profile — includes status, email, role, verification state.
 * Only ever returned to the authenticated user themselves.
 */
const SELF_FIELDS = [
  '_id', 'employeeId', 'username', 'displayName', 'email', 'avatar', 'bio',
  'role', 'status', 'isEmailVerified', 'isOnline', 'lastSeen',
  'createdAt', 'updatedAt',
];

/**
 * Public profile — what other users can see.
 * Strips email, role, status, verification state.
 */
const PUBLIC_FIELDS = [
  '_id', 'employeeId', 'username', 'displayName', 'avatar', 'bio',
  'isOnline', 'lastSeen',
];

/**
 * Minimal reference — used in message sender, conversation participant lists.
 * Absolutely minimal — only what the UI needs to render a name/avatar.
 */
const REF_FIELDS = ['_id', 'username', 'displayName', 'avatar'];

const pick = (obj, fields) => {
  if (!obj) return null;
  // Handle both Mongoose documents and plain objects (from .lean())
  const src = typeof obj.toObject === 'function' ? obj.toObject() : obj;
  return fields.reduce((acc, key) => {
    if (src[key] !== undefined) acc[key] = src[key];
    return acc;
  }, {});
};

export const sanitizeUser = (user, publicOnly = false) =>
  pick(user, publicOnly ? PUBLIC_FIELDS : SELF_FIELDS);

export const sanitizeUserRef = (user) => pick(user, REF_FIELDS);

export default sanitizeUser;
