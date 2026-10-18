import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { notifyAdmins } from "@/lib/app/admin";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

// A member asks to join the volunteer team; an admin approves it in the app (Admin → Volunteer requests).
// Members can't check in until then.
export const GET = handler(async (req) => {
  const user = await requireUser(req);
  await appReady();
  const rows = await db()`select id, note, status, created_at, decided_at from app_volunteer_requests where user_id = ${user.id} order by id desc limit 1`;
  return Response.json({ request: rows[0] ?? null, role: user.role });
});

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  if (user.role !== "member") return fail("You're already part of the team");
  await appReady();
  const sql = db();
  const note = str((await body(req)).note, 500);
  const pending = await sql`select id, note, status, created_at, decided_at from app_volunteer_requests where user_id = ${user.id} and status = 'pending'`;
  if (pending.length) return Response.json({ request: pending[0] });
  const rows = await sql`insert into app_volunteer_requests (user_id, note) values (${user.id}, ${note}) returning id, note, status, created_at, decided_at`;
  await notifyAdmins("New volunteer request", `${user.name || "A member"} would like to serve as a volunteer.`).catch(() => {});
  return Response.json({ request: rows[0] }, { status: 201 });
});
