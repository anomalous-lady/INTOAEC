// src/utils/email.js
import nodemailer from 'nodemailer';
import logger from '../config/logger.js';

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendMail = async ({ to, subject, html, text }) => {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"AEC Platform" <noreply@intoaec.com>',
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email sent [${info.messageId}]`);
    return info;
  } catch (err) {
    logger.error(`Failed to send email to ${to}: ${err.message}`);
    throw err;
  }
};

export const sendVerificationEmail = async (user, token) => {
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your AEC account',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Welcome to AEC, ${user.displayName || user.username}!</h2>
        <p>Please verify your email address to get started.</p>
        <a href="${verifyUrl}"
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;
                  text-decoration:none;border-radius:6px;margin:16px 0">
          Verify Email
        </a>
        <p style="color:#888;font-size:12px">
          This link expires in 24 hours. If you didn't create an account, ignore this email.
        </p>
      </div>
    `,
    text: `Verify your email: ${verifyUrl}`,
  });
};

export const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'AEC Password Reset',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>Reset your password</h2>
        <p>You requested a password reset for your AEC account.</p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;
                  text-decoration:none;border-radius:6px;margin:16px 0">
          Reset Password
        </a>
        <p style="color:#888;font-size:12px">
          This link expires in 10 minutes. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
    text: `Reset your password: ${resetUrl}`,
  });
};

export default sendMail;

export const sendInvitationEmail = async ({ email, inviterName }, token) => {
  const registerUrl = `${process.env.CLIENT_URL}/register?invite=${token}`;
  await sendMail({
    to: email,
    subject: `You've been invited to join AEC`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2>You're invited to AEC</h2>
        <p>${inviterName} has invited you to join the AEC platform.</p>
        <a href="${registerUrl}"
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;
                  text-decoration:none;border-radius:6px;margin:16px 0">
          Accept Invitation
        </a>
        <p style="color:#888;font-size:12px">
          This invitation expires in 7 days. If you were not expecting this, ignore it.
        </p>
      </div>
    `,
    text: `Accept your invitation: ${registerUrl}`,
  });
};
