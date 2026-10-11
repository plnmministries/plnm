import { db } from "@/lib/db";
import { PASSWORD_RULE, clearFailedLogins, findUser, hashPassword, issueToken, readPassword, verifyOtp } from "@/lib/app/auth";
import { publicUser, type AppUser } from "@/lib/app/schema";
import { body, fail, handler, str } from "@/lib/app/http";

// Step 2 of "forgot password": check the code, set the new password and sign out every other device.
// Returns a fresh token so this device stays signed in.
export const POST = handler(async (req) => {
  const b = await body(req);
  const identifier = str(b.username || b.identifier || b.email, 200).toLowerCase();
  const password = readPassword(b.password ?? b.newPassword);
  if (!password) return fail(PASSWORD_RULE);
  const user = await findUser(identifier);
  const result = user?.email ? await verifyOtp(user.email, str(b.code, 10)) : "expired";
  if (result === "wrong") return fail("That code isn't right. Please check and try again.", 401);
  if (result === "expired" || !user) return fail("That code has expired. Request a new one.", 401);
  const { salt, hash } = await hashPassword(password);
  const rows = await db()`update app_users set password_hash = ${hash}, password_salt = ${salt}, token_version = token_version + 1
                           where id = ${user.id} returning *`;
  await db()`delete from app_push_tokens where user_id = ${user.id}`;
  await clearFailedLogins(user);
  const updated = rows[0] as AppUser;
  return Response.json({ token: await issueToken(updated), user: publicUser(updated) });
});
