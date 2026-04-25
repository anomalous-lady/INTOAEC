// src/routes/voice.routes.js
import { Router } from 'express';
import { getPlivoToken, answerWebhook, hangupWebhook, recordingWebhook } from '../controllers/voice.controller.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Endpoint to generate JWT token for the browser SDK
router.get('/plivo/token', protect, getPlivoToken);

// Plivo webhooks - these must be public so Plivo can post to them
// Note: Plivo signature validation could be added here for security
router.post('/plivo/answer', answerWebhook);
router.post('/plivo/hangup', hangupWebhook);
router.post('/plivo/recordings', recordingWebhook);

// Allow GET for webhooks to handle missing/empty callbacks or test ping easily
router.get('/plivo/answer', answerWebhook);
router.get('/plivo/hangup', hangupWebhook);

export default router;
