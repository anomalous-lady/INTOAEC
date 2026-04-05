// src/utils/whatsapp.js
import logger from '../config/logger.js';

const META_API_URL = 'https://graph.facebook.com/v21.0';

// Read tokens fresh each call so .env hot-reloads work
function getPhoneNumberId() { return process.env.WHATSAPP_PHONE_NUMBER_ID; }
function getAccessToken() { return process.env.WHATSAPP_ACCESS_TOKEN; }

/**
 * Sends a text or media message to a WhatsApp recipient via the Meta Cloud API.
 * @param {string} recipientId  – WhatsApp ID (phone number with country code, no +)
 * @param {string} content      – Message body (text) or public URL (image/video/doc)
 * @param {string} messageType  – 'text' | 'image' | 'video' | 'audio' | 'document'
 * @returns {Promise<{ message_id: string }>}
 */
export async function sendToWhatsApp(recipientId, content, messageType = 'text') {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();

  if (!phoneNumberId || !accessToken) {
    logger.error('WhatsApp credentials missing – set WHATSAPP_PHONE_NUMBER_ID & WHATSAPP_ACCESS_TOKEN in .env');
    throw new Error('WhatsApp service not configured');
  }

  // ── Build Meta-format payload ──────────────────────────────────────────────
  //  The Cloud API expects:  { messaging_product, to, type, <type>: { ... } }
  //  NOT a nested "messages" array.
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientId,
    type: messageType === 'text' ? 'text' : messageType,
  };

  if (messageType === 'text' || !messageType) {
    payload.text = { preview_url: false, body: content };
  } else if (messageType === 'image') {
    payload.image = { link: content };
  } else if (messageType === 'video') {
    payload.video = { link: content };
  } else if (messageType === 'audio') {
    payload.audio = { link: content };
  } else if (messageType === 'document' || messageType === 'file') {
    payload.type = 'document';
    payload.document = { link: content, filename: 'file' };
  } else {
    // Fallback — treat as text
    payload.type = 'text';
    payload.text = { preview_url: false, body: content };
  }

  logger.info(`--- SENDING WHATSAPP ---`);
  logger.info(`Recipient: ${recipientId} | Type: ${payload.type}`);
  logger.info(`Content:   ${content?.substring(0, 120)}`);

  try {
    const response = await fetch(`${META_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(`WhatsApp API Error (${response.status}): ${JSON.stringify(data)}`);
      throw new Error(data?.error?.message || `WhatsApp API error: ${response.statusText}`);
    }

    logger.info(`WhatsApp message sent OK – wamid: ${data.messages?.[0]?.id}`);
    return { message_id: data.messages?.[0]?.id };
  } catch (error) {
    logger.error(`Failed to send WhatsApp message: ${error.message}`);
    throw error;
  }
}

/**
 * Downloads a media file from Meta (used for incoming vendor images/audio/video).
 * @param {string} mediaId      – Meta media ID from the webhook payload
 * @param {string} originalName – Optional original filename
 * @returns {Promise<{ url: string, mimetype: string, buffer: Buffer } | null>}
 */
export async function getMediaUrl(mediaId) {
  const accessToken = getAccessToken();
  if (!accessToken) return null;

  try {
    const res = await fetch(`${META_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Meta media lookup error: ${res.statusText}`);
    const data = await res.json();
    return data.url;           // the actual download URL (requires bearer token)
  } catch (err) {
    logger.error(`getMediaUrl failed: ${err.message}`);
    return null;
  }
}

/**
 * Downloads the binary content of a media file.
 */
export async function downloadMediaBuffer(downloadUrl) {
  const accessToken = getAccessToken();
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Media download error: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimetype = res.headers.get('content-type') || 'application/octet-stream';
  return { buffer, mimetype };
}
