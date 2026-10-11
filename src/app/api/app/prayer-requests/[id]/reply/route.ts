import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { notify } from "@/lib/app/push";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

// Reply to a prayer request (prayer team). The member gets a notification.
export const POST = handler(async (req, ctx: RouteContext<"/api/app/prayer-requests/[id]/reply">) => {
  const me = await requireUser(req, ["volunteer", "admin"]);
  await appReady();
  const { id } = await ctx.params;
  const b = await body(req);
  const reply = str(b.reply, 2000);
  const status = b.status === "praying" ? "praying" : "answered";
  if (!reply && status === "answered") return fail("Write a reply first");
  const rows = await db()`
    update app_prayer_requests set reply = ${reply || null}, status = ${status}, replied_by = ${me.id}, replied_at = now(), reply_seen = false
    where id = ${Number(id)} returning user_id`;
  if (!rows.length) return fail("Request not found", 404);
  if (reply) await notify(`user:${Number(rows[0].user_id)}`, "Your prayer request 🙏", reply, { kind: "prayer-reply", id: Number(id) });
  return Response.json({ ok: true });
});
