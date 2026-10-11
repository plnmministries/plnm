import "server-only";
import nodemailer from "nodemailer";

// Sends the login code by email. Configure SMTP_URL (e.g. smtps://user:app-password@smtp.gmail.com:465)
// and MAIL_FROM. Without SMTP the code is only logged (and, outside production, returned to the app).

export const mailConfigured = () => !!process.env.SMTP_URL;

export async function sendLoginCode(to: string, code: string, churchName: string) {
  if (!mailConfigured()) {
    console.log(`[mail] (SMTP not configured) login code for ${to}: ${code}`);
    return false;
  }
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  const from = process.env.MAIL_FROM || `${churchName} <no-reply@paralokanestham.in>`;
  await transport.sendMail({
    from,
    to,
    subject: `${code} is your ${churchName} login code`,
    text: `Your login code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1b1520">
      <p style="font-size:14px;color:#6b6474;margin:0 0 8px">${churchName}</p>
      <p style="font-size:16px;margin:0 0 16px">Your login code is</p>
      <p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 16px;color:#c8102e">${code}</p>
      <p style="font-size:13px;color:#6b6474;margin:0">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>`,
  });
  return true;
}
