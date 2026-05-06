// src/controllers/voice.controller.js
import plivo from 'plivo';
import Call from '../models/Call.js';
import Conversation from '../models/Conversation.js';
import { AppError, catchAsync } from '../utils/AppError.js';
import { processCallRecording } from '../utils/aiPipeline.js';
import logger from '../config/logger.js';

export const getPlivoToken = catchAsync(async (req, res, next) => {
  const { PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_ENDPOINT_USERNAME, PLIVO_ENDPOINT_PASSWORD } = process.env;

  if (!PLIVO_AUTH_ID || !PLIVO_AUTH_TOKEN) {
    logger.error('[Voice] Missing PLIVO_AUTH_ID or PLIVO_AUTH_TOKEN in env');
    return next(new AppError('Plivo credentials not configured on the server.', 500));
  }

  if (!PLIVO_ENDPOINT_USERNAME) {
    logger.error('[Voice] Missing PLIVO_ENDPOINT_USERNAME in env');
    return next(new AppError('Plivo endpoint not configured on the server.', 500));
  }

  try {
    const client = new plivo.Client(PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN);
    
    // Plivo REST API generates a fully compliant token for the Browser SDK
    const response = await client.token.create(PLIVO_AUTH_ID, {
      sub: PLIVO_ENDPOINT_USERNAME,
      app: process.env.PLIVO_APP_ID || undefined,
      incoming_allow: true,
      outgoing_allow: true
    });

    const token = response.token;

    res.status(200).json({
      status: 'success',
      data: {
        token: token,
        endpoint: PLIVO_ENDPOINT_USERNAME,
      },
    });
  } catch (err) {
    logger.error('[Voice] Plivo credential error:', err?.message || err);
    return next(new AppError('Failed to retrieve Plivo credentials.', 500));
  }
});

// Webhook called by Plivo when the browser SDK initiates an outbound call
export const answerWebhook = (req, res) => {
  const params = { ...req.query, ...req.body };
  logger.info('[Voice] Answer Webhook received — ' + JSON.stringify({
    From: params.From, To: params.To, CallUUID: params.CallUUID,
    Direction: params.Direction, CallStatus: params.CallStatus,
    'X-PH-conversationid': params['X-PH-conversationid'] || params['x-ph-conversationid'],
  }));

  const to = params.To;
  // Custom SIP headers forwarded by Plivo (prefixed with X-PH-)
  const conversationId = params['X-PH-conversationid'] ||
                         params['x-ph-conversationid'] ||
                         params.conversationId;

  // Caller ID must be a verified Plivo number or your SIP endpoint
  const callerId = process.env.PLIVO_CALLER_ID || process.env.PLIVO_AUTH_ID || '12025551234';

  const response = new plivo.Response();

  // Base URL for callbacks (ngrok in dev, server URL in prod)
  const baseUrl = process.env.NGROK_URL ||
                  (process.env.NODE_ENV === 'production' ? process.env.SERVER_URL : '') ||
                  'http://localhost:5000';

  const recordUrl = `${baseUrl}/api/voice/plivo/recordings?conversationId=${conversationId || ''}`;
  const hangupUrl = `${baseUrl}/api/voice/plivo/hangup?conversationId=${conversationId || ''}`;

  // Start recording — Plivo will POST to this URL when recording is ready
  response.addRecord({
    action: recordUrl,
    redirect: 'false',
    maxLength: 3600,           // 1 hour max
    transcriptionType: 'auto', // optional: plivo's own basic transcription (separate from Whisper)
    transcriptionUrl: '',
  });

  if (to) {
    // Clean destination number: strip whitespace, ensure E.164 format
    const cleanTo = to.replace(/\s+/g, '').replace(/^(\d)/, '+$1');
    logger.info(`[Voice] Dialing ${cleanTo} with callerId=${callerId}`);
    const dial = response.addDial({ callerId, callbackUrl: hangupUrl, callbackMethod: 'POST' });
    dial.addNumber(cleanTo);
  } else {
    logger.warn('[Voice] No destination number — hanging up');
    // No destination — hang up gracefully
    response.addHangup({ reason: 'No destination number provided' });
  }

  const xml = response.toXML();
  logger.info(`[Voice] Answer XML response: ${xml}`);
  res.set('Content-Type', 'text/xml');
  res.send(xml);
};

// Webhook called by Plivo when a call hangs up
export const hangupWebhook = catchAsync(async (req, res, next) => {
  const params = { ...req.query, ...req.body };
  logger.info('[Voice] Hangup Webhook received — ' + JSON.stringify({
    CallUUID: params.CallUUID, Duration: params.Duration,
    HangupCause: params.HangupCause, BillDuration: params.BillDuration,
  }));

  const { CallUUID, Duration, HangupCause, BillDuration } = params;
  const conversationId = params['X-PH-conversationid'] ||
                         params['x-ph-conversationid'] ||
                         params.conversationId;

  // Extract userId from custom SIP headers if passed
  const userId = params['X-PH-userid'] || params['x-ph-userid'] || null;

  if (CallUUID) {
    // Upsert: create or update the call record.
    // Recording webhook may arrive after hangup, so we use findOneAndUpdate.
    const durationSecs = parseInt(BillDuration || Duration || '0', 10);

    const setOnInsert = {
      roomId: CallUUID,
      type: 'pstn',
      initiator: userId || null,
    };
    // Only set conversationId if it's a valid-looking ObjectId (24 hex chars)
    if (conversationId && /^[a-f0-9]{24}$/i.test(conversationId)) {
      setOnInsert.conversationId = conversationId;
    }

    await Call.findOneAndUpdate(
      { plivoCallUuid: CallUUID },
      {
        $setOnInsert: setOnInsert,
        $set: {
          status: 'ended',
          duration: durationSecs,
          endedAt: new Date(),
          endReason: HangupCause || 'normal',
        },
      },
      { upsert: true, new: true }
    );
    logger.info(`[Voice] Call record updated for UUID=${CallUUID}, duration=${durationSecs}s`);
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
