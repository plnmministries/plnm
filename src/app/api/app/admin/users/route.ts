import { db } from "@/lib/db";
import { PASSWORD_RULE, USERNAME_RULE, hashPassword, normalizeUsername, readPassword } from "@/lib/app/auth";
import { appReady, publicUser, type AppUser } from "@/lib/app/schema";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

const ROLES = ["member", "volunteer", "admin"] as const;

// Everyone with an account, newest first (search by name, username, email or phone; filter by role).
export const GET = handler(async (req) => {
  await requireUser(req, ["admin"]);
  await appReady();
  const p = new URL(req.url).searchParams;
  const q = (p.get("q") || "").trim().slice(0, 80);
  const like = `%${q}%`;
  const role = ROLES.find((r) => r === p.get("role")) ?? null;
  const rows = await db()`
    select u.*, exists(select 1 from app_volunteer_requests v where v.user_id = u.id and v.status = 'pending') as wants_to_volunteer
    from app_users u
    where (${q === ""} or u.name ilike ${like} or u.username ilike ${like} or u.email ilike ${like} or u.phone ilike ${like})
      and (${role === null} or u.role = ${role ?? ""})
    order by u.created_at desc limit 200`;
  return Response.json({
    users: rows.map((u) => ({ ...publicUser(u as AppUser), blocked: Boolean(u.blocked), lastSeenAt: u.last_seen_at, wantsToVolunteer: Boolean(u.wants_to_volunteer) })),
  });
});

// Create an account for someone (a volunteer or admin id): name, password and at least one of username,
// email or mobile number to sign in with.
export const POST = handler(async (req) => {
  await requireUser(req, ["admin"]);
  const b = await body(req);
  const name = str(b.name, 80);
  if (name.length < 2) return fail("Please enter the person's name");
  const role = ROLES.find((r) => r === b.role) ?? "volunteer";
  const rawUsername = str(b.username, 40);
  const username = rawUsername ? normalizeUsername(rawUsername) : null;
  if (rawUsername && !username) return fail(USERNAME_RULE);
  const email = str(b.email, 200).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail("Please enter a valid email address");
  const phone = str(b.phone, 20).replace(/[^\d+ ]/g, "") || null;
  if (!username && !email && !phone) return fail("Give a username, email or mobile number to sign in with");
  const password = readPassword(b.password);
  if (!password) return fail(PASSWORD_RULE);
  await appReady();
  const sql = db();
  if (username && (await sql`select 1 from app_users where username = ${username}`).length) return fail("That username is taken", 409);
  if (email && (await sql`select 1 from app_users where email = ${email}`).length) return fail("An account with this email already exists", 409);
  if (phone && (await sql`select 1 from app_users where right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${phone.replace(/\D/g, "").slice(-10)}`).length)
    return fail("An account with this mobile number already exists", 409);
  const { salt, hash } = await hashPassword(password);
  try {
    const rows = await sql`insert into app_users (username, password_hash, password_salt, name, email, phone, role)
      values (${username}, ${hash}, ${salt}, ${name}, ${email}, ${phone}, ${role}) returning *`;
    return Response.json({ user: publicUser(rows[0] as AppUser) }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return fail("That username, email or phone is already in use", 409);
    throw e;
  }
});
