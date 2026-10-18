import { clearFailedLogins, clientIp, findUser, issueToken, loginLocked, noteFailedLogin, verifyPassword } from "@/lib/app/auth";
import { publicUser } from "@/lib/app/schema";
import { body, fail, handler, str } from "@/lib/app/http";

// Sign in with username (or email) + password; returns a long-lived token + the profile.
// 10 wrong passwords for the same username in 15 minutes lock it for a while.
export const POST = handler(async (req) => {
  const b = await body(req);
  const identifier = str(b.username || b.identifier || b.email, 200).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  if (!identifier || !password) return fail("Please enter your mobile number or email and your password");
  if (await loginLocked(identifier)) return fail("Too many attempts. Please wait 15 minutes and try again.", 429);
  const user = await findUser(identifier);
  const ok = await verifyPassword(password, user); // runs scrypt even for unknown accounts, so timing doesn't reveal them
  if (!user || !ok) {
    await noteFailedLogin(identifier, clientIp(req));
    return fail("Incorrect mobile number, email or password. Check it, or use “Forgot password”.", 401);
  }
  if (user.blocked) return fail("This account has been blocked. Please contact the church office.", 403);
  await clearFailedLogins(user);
  return Response.json({ token: await issueToken(user), user: publicUser(user) });
});
