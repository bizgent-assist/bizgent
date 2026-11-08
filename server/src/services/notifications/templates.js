// Central email templates. Sender identity comes from env; recipients come from user data.
import { env } from '../../config/env.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, bodyHtml) {
  const net = env.NEAR_NETWORK === 'testnet'
    ? '<p style="margin:0 0 16px;padding:8px 12px;background:#fff7e6;border:1px solid #f5c26b;border-radius:6px;font-size:12px;color:#8a5a00">TESTNET — test tokens only, no real funds.</p>'
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e5e7eb;border-radius:12px">
  <tr><td style="padding:28px 32px">
    <div style="font-weight:700;font-size:18px;letter-spacing:-0.02em;margin-bottom:20px">${esc(env.APP_NAME)}</div>
    ${net}<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}
    <p style="margin:28px 0 0;font-size:12px;color:#64748b">${env.SUPPORT_EMAIL ? `Questions? Contact ${esc(env.SUPPORT_EMAIL)}.` : ''}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

const button = (href, label) => `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${esc(label)}</a></p>`;

export const templates = {
  passwordReset: ({ name, link }) => ({
    subject: `Reset your ${env.APP_NAME} password`,
    html: layout('Reset your password', `<p>Hi ${esc(name)},</p><p>Use the link below to choose a new password. It expires in 30 minutes. If you did not request this, ignore this email.</p>${button(link, 'Reset password')}`),
  }),
  approvalRequest: ({ name, businessName, amount, recipient, purpose, reasons, expiresAt, link }) => ({
    subject: `Approval needed: ${amount} to ${recipient}`,
    html: layout('A payment needs your approval', `<p>Hi ${esc(name)},</p>
      <p>A payment for <strong>${esc(businessName)}</strong> requires your review:</p>
      <table style="font-size:14px;border-collapse:collapse;margin:8px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Amount</td><td><strong>${esc(amount)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Recipient</td><td>${esc(recipient)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Purpose</td><td>${esc(purpose)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Expires</td><td>${esc(expiresAt)}</td></tr>
      </table>
      <p style="font-size:13px;color:#475569">Why approval is needed: ${esc(reasons.join('; '))}</p>
      ${button(link, 'Review in Bizgent')}
      <p style="font-size:12px;color:#64748b">Opening this link does not approve or send anything. Payment happens only after you sign it with your own wallet inside ${esc(env.APP_NAME)}.</p>`),
  }),
  paymentConfirmed: ({ name, amount, recipient, purpose, explorerLink }) => ({
    subject: `Payment confirmed: ${amount} to ${recipient}`,
    html: layout('Payment confirmed on-chain', `<p>Hi ${esc(name)},</p><p>${esc(amount)} to ${esc(recipient)} for “${esc(purpose)}” was verified on NEAR.</p>${button(explorerLink, 'View on explorer')}`),
  }),
  paymentFailed: ({ name, amount, recipient, reason, link }) => ({
    subject: `Payment failed: ${amount} to ${recipient}`,
    html: layout('Payment failed', `<p>Hi ${esc(name)},</p><p>The payment of ${esc(amount)} to ${esc(recipient)} did not complete: ${esc(reason)}. Any debited vault balance was restored by the contract.</p>${button(link, 'Open Bizgent')}`),
  }),
};
