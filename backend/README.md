# AEC Backend — Node.js + Express + MongoDB

Production-ready backend for the **intoaec AI Communication Platform**.

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 18+ (ESM) |
| Framework | Express 4 |
| Database | MongoDB via Mongoose 8 |
| Real-time | Socket.io 4 |
| Auth | JWT (access + refresh tokens) + HttpOnly cookies |
| File uploads | Multer + Sharp (image processing) |
| Security | Helmet, CORS, rate-limiter, mongo-sanitize, HPP, bcrypt |
| Logging | Winston (file rotation + console) |
| Email | Nodemailer (SMTP) |

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in all values — especially MONGO_URI and JWT secrets
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Run in development
```bash
npm run dev
```

### 4. Run in production
```bash
NODE_ENV=production npm start
```

---

## Project Structure

```
src/
├── config/
│   ├── db.js           # MongoDB connection + graceful shutdown
│   └── logger.js       # Winston logger
├── controllers/
│   ├── auth.controller.js
│   ├── call.controller.js
│   ├── conversation.controller.js
│   ├── message.controller.js
│   ├── upload.controller.js
│   └── user.controller.js
├── middleware/
│   ├── auth.js         # JWT protect, restrictTo, optionalAuth
│   ├── errorHandler.js # Global error handler
│   ├── rateLimiter.js  # API / auth / upload rate limits
│   ├── upload.js       # Multer config + MIME validation
│   └── validate.js     # express-validator runner
├── models/
│   ├── Call.js
│   ├── Conversation.js
│   ├── Message.js
│   └── User.js
├── routes/
│   ├── auth.routes.js
│   ├── call.routes.js
│   ├── conversation.routes.js
│   ├── message.routes.js
│   ├── upload.routes.js
│   └── user.routes.js
├── socket/
│   ├── index.js        # Socket.io init + connection manager
│   ├── socketAuth.js   # JWT auth for socket handshake
│   └── handlers/
│       ├── chat.handler.js     # Messaging, typing, reactions, read receipts
│       ├── presence.handler.js # Online/offline tracking
│       └── webrtc.handler.js   # WebRTC signaling (offer/answer/ICE)
├── utils/
│   ├── AppError.js     # Operational error class + catchAsync
│   ├── email.js        # Nodemailer templates
│   └── jwt.js          # Token signing, verifying, cookie helpers
├── app.js              # Express app (all middleware + routes)
└── index.js            # Entry point (HTTP server + Socket.io bootstrap)

uploads/
├── avatars/            # Processed WebP profile pictures
├── files/              # Message attachments
└── temp/               # Raw uploads before processing
```

---

## API Reference

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | ✗ | Register new account |
| POST | `/login` | ✗ | Login, get tokens |
| POST | `/refresh` | ✗ | Rotate access token using refresh token |
| POST | `/logout` | ✓ | Logout current device |
| POST | `/logout-all` | ✓ | Logout all devices |
| GET | `/me` | ✓ | Get current user |
| GET | `/verify-email/:token` | ✗ | Verify email address |
| POST | `/forgot-password` | ✗ | Send reset email |
| PATCH | `/reset-password/:token` | ✗ | Reset password |
| PATCH | `/change-password` | ✓ | Change password |

### Users — `/api/users`

| Method | Path | Description |
|---|---|---|
| GET | `/search?q=` | Search users by username/name |
| GET | `/online` | Get all online users |
| GET | `/:userId` | Get user profile |
| PATCH | `/me/profile` | Update display name / bio |
| POST | `/me/avatar` | Upload/replace avatar |
| DELETE | `/me/avatar` | Remove avatar |
| DELETE | `/me/deactivate` | Deactivate own account |

### Conversations — `/api/conversations`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Get all my conversations (with unread counts) |
| GET | `/direct/:userId` | Get or create direct conversation |
| POST | `/group` | Create group conversation |
| GET | `/:conversationId` | Get single conversation |
| PATCH | `/:conversationId` | Update group name/description (admin only) |
| POST | `/:conversationId/participants` | Add participants (admin only) |
| POST | `/:conversationId/leave` | Leave group |
| POST | `/:conversationId/read` | Mark conversation as read |

### Messages — `/api/conversations/:conversationId/messages`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Get messages (paginated, cursor-based) |
| GET | `/search?q=` | Search messages |
| POST | `/` | Send message (supports file attachments) |
| PATCH | `/:messageId` | Edit message (own messages only) |
| DELETE | `/:messageId` | Soft-delete message |
| POST | `/:messageId/reactions` | Toggle emoji reaction |
| POST | `/read` | Mark messages as read |

### Calls — `/api/calls`

| Method | Path | Description |
|---|---|---|
| POST | `/` | Initiate a call |
| POST | `/:roomId/join` | Join a call |
| POST | `/:roomId/end` | End a call |
| POST | `/:roomId/reject` | Reject incoming call |
| GET | `/history/:conversationId` | Call history |
| GET | `/active/:conversationId` | Get active call if any |

### Uploads — `/api/uploads`

| Method | Path | Description |
|---|---|---|
| POST | `/` | Upload files (up to 5, 10MB each) |
| DELETE | `/:filename` | Delete a file |

---

## Socket.io Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `conversation:join` | `conversationId` | Join a conversation room |
| `conversation:leave` | `conversationId` | Leave a conversation room |
| `message:send` | `{conversationId, content, messageType, replyTo, tempId}` | Send message in real-time |
| `message:read` | `{conversationId, messageIds[]}` | Mark messages as read |
| `message:react` | `{messageId, emoji, conversationId}` | Toggle reaction |
| `typing:start` | `{conversationId}` | Start typing indicator |
| `typing:stop` | `{conversationId}` | Stop typing indicator |
| `presence:update` | `{status}` | Update own status (online/away/busy) |
| `webrtc:call-user` | `{targetUserId, roomId, offer, callType}` | Send WebRTC offer |
| `webrtc:call-answer` | `{callerId, roomId, answer}` | Send WebRTC answer |
| `webrtc:ice-candidate` | `{targetUserId, candidate, roomId}` | Exchange ICE candidate |
| `webrtc:end-call` | `{roomId, targetUserIds[]}` | End/hang up call |
| `webrtc:reject-call` | `{callerId, roomId}` | Reject incoming call |
| `webrtc:join-room` | `{roomId}` | Join WebRTC room |
| `webrtc:leave-room` | `{roomId}` | Leave WebRTC room |
| `webrtc:media-state` | `{roomId, audio, video}` | Toggle mic/cam state |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `message:new` | Message object | New message in conversation |
| `message:read` | `{userId, conversationId, messageIds[]}` | Read receipt |
| `message:reaction` | `{messageId, reactions[]}` | Reaction update |
| `typing:start` | `{userId, user, conversationId}` | Someone is typing |
| `typing:stop` | `{userId, conversationId}` | Someone stopped typing |
| `user:online` | `{userId, user}` | User came online |
| `user:offline` | `{userId, lastSeen}` | User went offline |
| `user:status` | `{userId, status}` | User status changed |
| `notification:message` | `{conversationId, message}` | New message notification |
| `webrtc:incoming-call` | `{roomId, callType, offer, caller}` | Incoming call |
| `webrtc:call-answered` | `{roomId, answer, answeredBy}` | Call accepted |
| `webrtc:ice-candidate` | `{candidate, fromUserId, roomId}` | ICE candidate received |
| `webrtc:call-ended` | `{roomId, endedBy}` | Call ended |
| `webrtc:call-rejected` | `{roomId, rejectedBy}` | Call rejected |
| `webrtc:peer-joined` | `{userId, user}` | Peer joined room |
| `webrtc:peer-left` | `{userId}` | Peer left room |
| `webrtc:peer-media-state` | `{userId, audio, video}` | Peer changed media |

---

## Security Features

- **JWT rotation** — refresh tokens are rotated on every use; reuse triggers full session wipe
- **Brute-force protection** — accounts lock after 5 failed login attempts for 2 hours
- **Password hashing** — bcrypt with salt rounds of 12
- **NoSQL injection** — `express-mongo-sanitize` strips `$` and `.` operators from inputs
- **XSS** — `helmet` sets Content-Security-Policy; JSON body limit of 10kb
- **HTTP Parameter Pollution** — `hpp` middleware prevents query string pollution
- **Rate limiting** — 100 req/15min globally, 10 req/15min on auth routes
- **Secure cookies** — HttpOnly, Secure (prod), SameSite strict
- **CORS** — whitelist-only with credentials
- **File uploads** — MIME type validation, UUID filenames (no path traversal), size limits
- **Image processing** — Sharp resizes/converts avatars to WebP (strips EXIF data)
- **Soft deletes** — messages are never hard-deleted; content is nulled for audit trail

---

## Connecting to the Next.js Frontend

1. Copy `FRONTEND.env.local.example` to your frontend root as `.env.local`
2. Set `NEXT_PUBLIC_API_URL=http://localhost:5000/api`
3. Set `NEXT_PUBLIC_BACKEND_URL=http://localhost:5000`
4. Use the provided API client at `lib/api.js` and socket client at `lib/socket.js`

---

## Environment Variables

See `.env.example` for the full list with descriptions.
All secrets must be cryptographically random. Never commit `.env` to git.
