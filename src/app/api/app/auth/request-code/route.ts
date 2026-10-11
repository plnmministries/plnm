import { createOtp } from "@/lib/app/auth";
import { mailConfigured, sendLoginCode } from "@/lib/app/mail";
import { body, fail, handler, str } from "@/lib/app/http";
import { getContent } from "@/lib/content";

// Step 1 of email login: send a 6-digit code.
export const POST = handler(async (req) => {
  const { email } = await body(req);
  const target = str(email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target)) return fail("Please enter a valid email address");
  const code = await createOtp(target);
  if (!code) return fail("A code was sent less than a minute ago. Please check your inbox (and spam).", 429);
  const { settings } = await getContent();
  const delivered = await sendLoginCode(target, code, settings.churchName);
  // without SMTP (local development) the code comes back in the response
  const devCode = !mailConfigured() && process.env.NODE_ENV !== "production" ? code : undefined;
  return Response.json({ ok: true, delivered, devCode });
});
