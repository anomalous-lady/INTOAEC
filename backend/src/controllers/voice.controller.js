// src/controllers/voice.controller.js
import plivo from 'plivo';
import Call from '../models/Call.js';
import Conversation from '../models/Conversation.js';
import { AppError, catchAsync } from '../utils/AppError.js';
import { processCallRecording } from '../utils/aiPipeline.js';
import logger from '../config/logger.js';

export const getPlivoToken = catchAsync(async (req, res, next) => {
  const { PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_APP_ID } = process.env;

  if (!PLIVO_AUTH_ID || !PLIVO_AUTH_TOKEN || !PLIVO_APP_ID) {
    return next(new AppError('Plivo credentials not configured on the server.', 500));
  }

  // Strip any non-alphanumeric chars to get a valid SIP endpoint username
  const endpointUsername = req.user.username.replace(/[^a-zA-Z0-9_]/g, '');

  try {
    // Plivo Node SDK AccessToken(authId, authToken, username, validity_seconds)
    const accessToken = new plivo.AccessToken(
      PLIVO_AUTH_ID,
      PLIVO_AUTH_TOKEN,
      endpointUsername,
      86400 // 24 hours in seconds
    );
    accessToken.addVoiceGrants({ incomingAllow: true, outgoingAllow: true });
    const token = accessToken.toJwt();

    logger.info(`Plivo token generated for user: ${endpointUsername}`);
    res.status(200).json({ status: 'success', data: { token, endpoint: endpointUsername } });
  } catch (err) {
    logger.error('Plivo Token Error:', err);
    return next(new AppError('Failed to generate Plivo token.', 500));
  }
});

// Webhook called by Plivo when the browser SDK initiates an outbound call
export const answerWebhook = (req, res) => {
  logger.info('Plivo Answer Webhook Received: ' + JSON.stringify(req.body || req.query || {}));

  const to = req.body?.To || req.query?.To;
  // Custom SIP headers forwarded by Plivo (prefixed with X-PH-)
  const conversationId = req.body?.['X-PH-conversationid'] ||
                         req.body?.['x-ph-conversationid'] ||
                         req.query?.conversationId;

  // Caller ID must be a verified Plivo number or your SIP endpoint
  const callerId = process.env.PLIVO_CALLER_ID || process.env.PLIVO_AUTH_ID || '12025551234';

  const response = new plivo.Response();

  // Start recording — Plivo will POST to this URL when recording is ready
  const baseUrl = process.env.NGROK_URL ||
                  (process.env.NODE_ENV === 'production' ? process.env.SERVER_URL : '') ||
                  'http://localhost:5000';
  const recordUrl = `${baseUrl}/api/voice/plivo/recordings?conversationId=${conversationId || ''}`;

  response.addRecord({
    action: recordUrl,
    redirect: 'false',
    maxLength: 3600,           // 1 hour max
    transcriptionType: 'auto', // optional: plivo's own basic transcription (separate from Whisper)
    transcriptionUrl: '',
  });

  if (to) {
    const dial = response.addDial({ callerId });
    dial.addNumber(to);
  } else {
    // No destination — hang up gracefully
    response.addHangup({ reason: 'No destination number provided' });
  }

  res.set('Content-Type', 'text/xml');
  res.send(response.toXML());
};

// Webhook called by Plivo when a call hangs up
export const hangupWebhook = catchAsync(async (req, res, next) => {
  logger.info('Plivo Hangup Webhook Received: ' + JSON.stringify(req.body || {}));

  const body = req.body || {};
  const { CallUUID, Duration, HangupCause, BillDuration } = body;
  const conversationId = body['X-PH-conversationid'] ||
                         body['x-ph-conversationid'] ||
                         req.query?.conversationId;

  // Extract userId from custom SIP headers if passed
  const userId = body['X-PH-userid'] || body['x-ph-userid'] || null;

  if (CallUUID) {
    // Upsert: create or update the call record.
    // Recording webhook may arrive after hangup, so we use findOneAndUpdate.
    const durationSecs = parseInt(BillDuration || Duration || '0', 10);

    await Call.findOneAndUpdate(
      { plivoCallUuid: CallUUID },
      {
        $setOnInsert: {
          roomId: CallUUID,
          conversationId: conversationId || 'unknown',
          type: 'pstn',
          initiator: userId || null,
        },
        $set: {
          status: 'ended',
          duration: durationSecs,
          endedAt: new Date(),
          endReason: HangupCause || 'normal',
        },
      },
      { upsert: true, new: true }
    );
  }

  res.status(200).send('OK');
});

// Webhook called when the recording is ready
export const recordingWebhook = catchAsync(async (req, res, next) => {
  logger.info('Plivo Recording Webhook Received: ' + JSON.stringify(req.body || {}));

  const body = req.body || {};
  const { RecordUrl, CallUUID, RecordingID, Duration } = body;
  const conversationId = body['X-PH-conversationid'] ||
                         body['x-ph-conversationid'] ||
                         req.query?.conversationId;

  logger.info(`[RecordingWebhook] CallUUID=${CallUUID} convId=${conversationId} url=${RecordUrl}`);

  if (RecordUrl && conversationId && conversationId !== 'undefined') {
    // Upsert the call record with recording URL + mark AI as processing
    await Call.findOneAndUpdate(
      { plivoCallUuid: CallUUID },
      {
        $setOnInsert: {
          roomId: CallUUID || `rec-${Date.now()}`,
          conversationId,
          type: 'pstn',
        },
        $set: {
          recordingUrl: RecordUrl,
          aiStatus: 'processing',
        },
      },
      { upsert: true, new: true }
    );

    // Kick off AI pipeline asynchronously \u2014 pass callUuid so it can update the record
    const io = req.app.get('io');
    processCallRecording(RecordUrl, conversationId, io, CallUUID).catch((err) => {
      logger.error('[RecordingWebhook] Background AI Pipeline failed:', err?.message || err);
      Call.findOneAndUpdate({ plivoCallUuid: CallUUID }, { $set: { aiStatus: 'failed' } }).exec();
    });
  } else {
    logger.warn(`[RecordingWebhook] Missing RecordUrl or conversationId. Skipping AI pipeline.`);
  }

  res.status(200).send('OK');
});
