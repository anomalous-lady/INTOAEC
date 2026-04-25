// src/utils/aiPipeline.js
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Call from '../models/Call.js';

/**
 * Downloads a Plivo recording, transcribes via Whisper, summarizes via GPT-4,
 * stores a System Note in MongoDB, and broadcasts it via Socket.io.
 *
 * @param {string} recordingUrl  URL of the Plivo recording
 * @param {string} conversationId  MongoDB ObjectId of the Conversation
 * @param {object} io  Socket.io server instance
 * @param {string} [callUuid]  Plivo CallUUID (to update Call record)
 */
export const processCallRecording = async (recordingUrl, conversationId, io, callUuid) => {
  logger.info(`[AIPipeline] Starting for conv=${conversationId} url=${recordingUrl}`);

  if (!process.env.OPENAI_API_KEY) {
    logger.error('[AIPipeline] OPENAI_API_KEY not set. Aborting.');
    return;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Ensure uploads dir exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const tmpFilePath = path.join(uploadsDir, `rec_${uuidv4()}.mp3`);

  try {
    // ── 1. Wait briefly for Plivo to finalise the file ─────────────────────────
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // ── 2. Download the recording ───────────────────────────────────────────────
    logger.info(`[AIPipeline] Downloading recording…`);
    const response = await axios({
      url: recordingUrl,
      method: 'GET',
      responseType: 'stream',
      // Plivo requires HTTP Basic auth with AUTH_ID:AUTH_TOKEN for recording downloads
      ...(process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN
        ? { auth: { username: process.env.PLIVO_AUTH_ID, password: process.env.PLIVO_AUTH_TOKEN } }
        : {}),
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tmpFilePath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    logger.info(`[AIPipeline] Recording saved to ${tmpFilePath}`);

    // ── 3. Whisper transcription ────────────────────────────────────────────────
    logger.info('[AIPipeline] Sending to Whisper…');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpFilePath),
      model: 'whisper-1',
      language: 'en',
    });

    const transcriptText = transcription.text?.trim();
    if (!transcriptText) {
      logger.warn('[AIPipeline] Whisper returned empty transcript. Skipping GPT.');
      return;
    }
    logger.info('[AIPipeline] Transcription done.');

    // ── 4. GPT summary ──────────────────────────────────────────────────────────
    logger.info('[AIPipeline] Sending transcript to GPT…');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant for a construction-management platform (IntoAEC).
Summarize the following call transcript clearly and professionally.

Format your response EXACTLY as follows (use these exact section headers):

## Summary
<2-3 sentence overall summary>

## Action Items
- <item 1>
- <item 2>
(or "None detected" if empty)

## Prices Quoted
- <price detail>
(or "None detected" if empty)

## Key Dates & Deadlines
- <date/deadline>
(or "None detected" if empty)`,
        },
        {
          role: 'user',
          content: `Transcript:\n\n${transcriptText}`,
        },
      ],
      temperature: 0.3,
    });

    const summaryText = completion.choices[0].message.content?.trim() ?? '';

    // ── 5. Parse structured data from GPT markdown ──────────────────────────────
    const parseSection = (text, header) => {
      const regex = new RegExp(`## ${header}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
      const match = text.match(regex);
      if (!match) return [];
      return match[1]
        .split('\n')
        .map((l) => l.replace(/^-\s*/, '').trim())
        .filter((l) => l && l.toLowerCase() !== 'none detected');
    };

    const overallSummaryMatch = summaryText.match(/## Summary\n([\s\S]*?)(?=\n## |$)/i);
    const summaryData = {
      overallSummary: overallSummaryMatch ? overallSummaryMatch[1].trim() : summaryText.slice(0, 500),
      actionItems:    parseSection(summaryText, 'Action Items'),
      pricesQuoted:   parseSection(summaryText, 'Prices Quoted'),
      keyDates:       parseSection(summaryText, 'Key Dates & Deadlines'),
    };

    // ── 6. Find the conversation ────────────────────────────────────────────────
    const conversation = await Conversation.findById(conversationId).populate('participants.user', '_id');
    if (!conversation) {
      logger.error(`[AIPipeline] Conversation ${conversationId} not found.`);
      return;
    }

    // Find the first participant with a valid user reference
    const senderRef = conversation.participants.find((p) => p.user?._id)?.user?._id;
    if (!senderRef) {
      logger.error('[AIPipeline] No valid participant to assign sender. Aborting note creation.');
      return;
    }

    // ── 7. Create System Note message ───────────────────────────────────────────
    const noteContent = `📞 **Call Summary — AI Generated**\n\n${summaryText}`;

    const message = await Message.create({
      conversationId: conversation._id,
      sender: senderRef,
      senderType: 'system',
      content: noteContent,
      messageType: 'system',
      aiGenerated: true,
      aiModel: 'whisper-gpt-4o-mini',
      summaryData,
    });

    // Update conversation last activity
    conversation.lastMessage = message._id;
    conversation.lastActivity = new Date();
    await conversation.save();

    // Update Call record with transcript + summary
    if (callUuid) {
      await Call.findOneAndUpdate(
        { plivoCallUuid: callUuid },
        {
          $set: {
            transcript: transcriptText,
            summary: summaryText,
            summaryData,
            aiStatus: 'completed',
          },
        }
      );
    }

    // ── 8. Broadcast via Socket.io ──────────────────────────────────────────────
    await message.populate('sender', 'username displayName avatar');

    if (io) {
      const broadcastPayload = message.toJSON();

      // Broadcast to the conversation room
      io.to(`conversation:${conversationId}`).emit('message:new', broadcastPayload);
      
      // Also emit explicit summary-ready event for UI reactivity (e.g. stopping spinners early)
      io.to(`conversation:${conversationId}`).emit('voice:summary-ready', {
        conversationId,
        message: broadcastPayload,
        callId: callUuid,
      });

      // Send per-user notifications
      conversation.participants.forEach((p) => {
        const uid = p.user?._id?.toString();
        if (uid) {
          io.to(`user:${uid}`).emit('notification:message', {
            conversationId,
            message: broadcastPayload,
          });
        }
      });

      logger.info('[AIPipeline] Broadcast complete.');
    }

    logger.info('[AIPipeline] Pipeline completed successfully.');
  } catch (err) {
    logger.error('[AIPipeline] Error:', err?.message || err);

    // Mark call as failed if we have UUID
    if (callUuid) {
      await Call.findOneAndUpdate(
        { plivoCallUuid: callUuid },
        { $set: { aiStatus: 'failed' } }
      ).catch(() => {});
    }
  } finally {
    // Always clean up temp file
    try {
      if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
    } catch (_) {}
  }
};
