import { db } from "@/lib/db";
import { clientIp, loginLocked, noteFailedLogin, verifyPassword } from "@/lib/app/auth";
import { body, fail, handler, requireUser } from "@/lib/app/http";

// Delete the signed-in account for good (Apple and Google require this in-app). Needs the password.
// Push tokens, prayer replies, prayer requests and attendance go with it (on delete cascade); replies this
// user wrote to others' prayer requests as a volunteer stay, unattributed.
export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const { password } = await body(req);
  const key = user.username ?? user.email ?? String(user.id);
  if (await loginLocked(key)) return fail("Too many attempts. Please wait 15 minutes and try again.", 429);
  if (typeof password !== "string" || !(await verifyPassword(password, user))) {
    await noteFailedLogin(key, clientIp(req));
    return fail("Incorrect password", 401);
  }
  await db().begin(async (sql) => {
    await sql`update app_prayer_requests set replied_by = null where replied_by = ${user.id}`;
    await sql`delete from app_login_attempts where kind = 'login' and (username = ${user.username ?? ""} or username = ${user.email ?? ""})`;
    if (user.email) await sql`delete from app_otps where target = ${user.email}`;
    await sql`delete from app_users where id = ${user.id}`;
  });
  return Response.json({ ok: true });
});
