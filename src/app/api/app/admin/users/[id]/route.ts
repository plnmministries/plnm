import { db } from "@/lib/db";
import { appReady, publicUser, type AppUser } from "@/lib/app/schema";
import { notify } from "@/lib/app/push";
import { body, fail, handler, requireUser } from "@/lib/app/http";

// Change someone's role or block/unblock them. Blocking signs them out everywhere.
export const PATCH = handler(async (req, ctx: RouteContext<"/api/app/admin/users/[id]">) => {
  const me = await requireUser(req, ["admin"]);
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return fail("Person not found", 404);
  const b = await body(req);
  const role = ["member", "volunteer", "admin"].includes(String(b.role)) ? String(b.role) : null;
  const blocked = typeof b.blocked === "boolean" ? b.blocked : null;
  if (Number(id) === Number(me.id) && ((role && role !== "admin") || blocked)) return fail("You can't remove your own admin access");
  await appReady();
  const sql = db();
  const before = (await sql`select role from app_users where id = ${Number(id)}`)[0];
  if (!before) return fail("Person not found", 404);
  const rows = await sql`update app_users set
      role = coalesce(${role}, role),
      blocked = coalesce(${blocked}, blocked),
      token_version = token_version + ${blocked ? 1 : 0}
    where id = ${Number(id)} returning *`;
  // someone made a volunteer through the role menu: their pending request is settled too
  if (role && role !== "member") await sql`update app_volunteer_requests set status = 'approved', decided_by = ${me.id}, decided_at = now() where user_id = ${Number(id)} and status = 'pending'`;
  if (role === "volunteer" && before.role === "member") await notify(`user:${Number(id)}`, "Welcome to the volunteer team 🙌", "Open the app → More → Volunteer to check in and help with prayer requests.", { kind: "custom" }).catch(() => 0);
  const u = rows[0] as AppUser;
  return Response.json({ user: { ...publicUser(u), blocked: Boolean(u.blocked) } });
});
