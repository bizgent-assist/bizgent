// Notification service. Email via Brevo transactional API (required); WhatsApp is a
// separate channel interface, intentionally not implemented in the MVP.
import { env } from '../../config/env.js';
import { Notification } from '../../models/index.js';
import { templates } from './templates.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

let transport = async ({ to, toName, subject, html }) => {
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
      to: [{ email: to, name: toName || undefined }],
      replyTo: env.SUPPORT_EMAIL ? { email: env.SUPPORT_EMAIL } : undefined,
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.message || 'request failed'}`);
  return { messageId: body.messageId };
};

/** Test hook */
export function setEmailTransport(fn) { transport = fn; }

/**
 * Sends a templated email and records the attempt. Never throws — notification failure
 * must not break a financial workflow. `sent` means accepted by Brevo, not delivered.
 */
export async function sendEmail({ template, to, toName, data, businessId, userId, related }) {
  const { subject, html } = templates[template](data);
  const record = await Notification.create({ businessId, userId, channel: 'email', template, to, subject, related, status: 'queued' });
  if (!env.emailConfigured) {
    record.status = 'skipped';
    record.error = 'Email not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)';
    await record.save();
    if (!env.isTest) console.warn(`[email] skipped ${template} to ${to}: not configured`);
    return record;
  }
  try {
    const { messageId } = await transport({ to, toName, subject, html });
    record.status = 'sent';
    record.providerMessageId = messageId;
  } catch (err) {
    record.status = 'failed';
    record.error = err.message.slice(0, 300);
    console.error('[email] send failed', template, err.message);
  }
  await record.save();
  return record;
}

const BREVO_EVENT_STATUS = {
  delivered: 'delivered', opened: 'opened', unique_opened: 'opened', click: 'opened',
  hard_bounce: 'bounced', soft_bounce: 'bounced', blocked: 'failed', invalid_email: 'failed', error: 'failed', spam: 'failed',
};

/** Brevo transactional webhook → delivery status update. */
export async function applyBrevoEvent(evt) {
  const status = BREVO_EVENT_STATUS[evt?.event];
  const id = evt?.['message-id'] || evt?.messageId;
  if (!status || !id) return false;
  const r = await Notification.updateOne({ providerMessageId: id }, { $set: { status } });
  return r.modifiedCount > 0;
}

export const whatsapp = {
  async send() {
    throw new Error('WhatsApp notifications are not enabled in this MVP');
  },
};
