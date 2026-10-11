import { findOrCreateUserByEmail, issueToken, verifyOtp } from "@/lib/app/auth";
import { publicUser } from "@/lib/app/schema";
import { body, fail, handler, str } from "@/lib/app/http";

// Step 2 of email login: check the code, return a long-lived token + the profile.
export const POST = handler(async (req) => {
  const { email, code } = await body(req);
  const target = str(email, 200).toLowerCase();
  const result = await verifyOtp(target, str(code, 10));
  if (result === "wrong") return fail("That code isn't right. Please check and try again.", 401);
  if (result === "expired") return fail("That code has expired. Request a new one.", 401);
  const user = await findOrCreateUserByEmail(target);
  if (user.blocked) return fail("This account has been blocked. Please contact the church office.", 403);
  return Response.json({ token: await issueToken(user), user: publicUser(user), isNew: !user.name });
});
