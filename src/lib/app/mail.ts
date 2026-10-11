import "server-only";
import { Resend } from "resend";

// Sends the password-reset code by email through Resend (https://resend.com). Configure RESEND_API_KEY
// and MAIL_FROM (an address on a domain verified in Resend, e.g. no-reply@paralokanestham.in).
// Without an API key the code is only logged (and, outside production, returned to the app).

export const mailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendResetCode(to: string, code: string, churchName: string) {
  if (!mailConfigured()) {
    console.log(`[mail] (RESEND_API_KEY not set) password reset code for ${to}: ${code}`);
    return false;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.MAIL_FROM || `${churchName} <no-reply@paralokanestham.in>`;
  const { error } = await resend.emails.send({
    from,
    to,
    subject: `${code} is your ${churchName} password reset code`,
    text: `Your password reset code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1b1520">
      <p style="font-size:14px;color:#6b6474;margin:0 0 8px">${churchName}</p>
      <p style="font-size:16px;margin:0 0 16px">Your password reset code is</p>
      <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 16px;color:#c8102e">${code}</p>
      <p style="font-size:13px;color:#6b6474;margin:0">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>`,
  });
  if (error) throw new Error(`Resend: ${error.name ?? ""} ${error.message}`.trim());
  return true;
}
