import { allowResetRequest, clientIp, createOtp, findUser } from "@/lib/app/auth";
import { mailConfigured, sendResetCode } from "@/lib/app/mail";
import { body, fail, handler, str } from "@/lib/app/http";
import { getContent } from "@/lib/content";

const MESSAGE = "If that account has an email address, a reset code is on its way. Check your inbox (and spam).";

// Step 1 of "forgot password": email a 6-digit code to the account's address.
// The reply is the same whether or not the account exists or has an email, so usernames can't be probed.
export const POST = handler(async (req) => {
  const b = await body(req);
  const identifier = str(b.username || b.identifier || b.email, 200).toLowerCase();
  if (!identifier) return fail("Please enter your mobile number or email");
  const ip = clientIp(req);
  if (!(await allowResetRequest(ip))) return fail("Too many reset requests from this network. Please try again in an hour.", 429);
  const user = await findUser(identifier);
  let code: string | undefined;
  if (user?.email) {
    const otp = await createOtp(user.email, ip);
    if ("code" in otp) {
      code = otp.code;
      const { settings } = await getContent();
      await sendResetCode(user.email, code, settings.churchName);
    }
  }
  // without Resend (local development) the code comes back in the response
  const devCode = code && !mailConfigured() && process.env.NODE_ENV !== "production" ? code : undefined;
  return Response.json({ ok: true, message: MESSAGE, devCode });
});
