import { db } from "@/lib/db";
import { PASSWORD_RULE, USERNAME_RULE, hashPassword, issueToken, normalizeUsername, readPassword } from "@/lib/app/auth";
import { appReady, publicUser, type AppUser } from "@/lib/app/schema";
import { body, fail, handler, str } from "@/lib/app/http";

// Create an account: username + password and a name; email (used only for password reset) and phone are optional.
export const POST = handler(async (req) => {
  const b = await body(req);
  const username = normalizeUsername(b.username);
  if (!username) return fail(USERNAME_RULE);
  const password = readPassword(b.password);
  if (!password) return fail(PASSWORD_RULE);
  const name = str(b.name, 80);
  if (name.length < 2) return fail("Please enter your name");
  const email = str(b.email, 200).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("Please enter a valid email address");
  const phone = str(b.phone, 20).replace(/[^\d+ ]/g, "") || null;

  await appReady();
  const sql = db();
  if ((await sql`select 1 from app_users where username = ${username}`).length) return fail("That username is taken. Please pick another.", 409);
  if (email && (await sql`select 1 from app_users where email = ${email}`).length) return fail("An account with this email already exists. Try “Forgot password”.", 409);
  if (phone && (await sql`select 1 from app_users where phone = ${phone}`).length) return fail("An account with this phone number already exists.", 409);

  const { salt, hash } = await hashPassword(password);
  try {
    // the first account ever created becomes the admin, so the client can manage the app from day one
    const rows = await sql`insert into app_users (username, password_hash, password_salt, name, email, phone, role)
      values (${username}, ${hash}, ${salt}, ${name}, ${email}, ${phone},
              case when (select count(*) from app_users) = 0 then 'admin' else 'member' end) returning *`;
    const user = rows[0] as AppUser;
    return Response.json({ token: await issueToken(user), user: publicUser(user) }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return fail("That username, email or phone is already in use.", 409); // lost a race
    throw e;
  }
});
