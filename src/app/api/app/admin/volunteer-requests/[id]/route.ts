import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { notify } from "@/lib/app/push";
import { body, fail, handler, requireUser } from "@/lib/app/http";

// Approve (the member becomes a volunteer and is notified) or decline a volunteer request.
export const POST = handler(async (req, ctx: RouteContext<"/api/app/admin/volunteer-requests/[id]">) => {
  const me = await requireUser(req, ["admin"]);
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return fail("Request not found", 404);
  const approve = (await body(req)).decision === "approve";
  await appReady();
  const sql = db();
  const rows = await sql`update app_volunteer_requests set status = ${approve ? "approved" : "declined"}, decided_by = ${me.id}, decided_at = now()
                         where id = ${Number(id)} and status = 'pending' returning user_id`;
  if (!rows.length) return fail("This request was already handled", 409);
  const userId = Number(rows[0].user_id);
  if (approve) {
    await sql`update app_users set role = 'volunteer' where id = ${userId} and role = 'member'`;
    await notify(`user:${userId}`, "Welcome to the volunteer team 🙌", "Open the app → More → Volunteer to check in and help with prayer requests.", { kind: "custom" }).catch(() => 0);
  }
  return Response.json({ ok: true });
});
