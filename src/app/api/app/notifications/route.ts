import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { handler, requireUser } from "@/lib/app/http";

// The signed-in person's notifications, newest first: everything sent to everyone, to volunteers (team only)
// and to them personally (prayer replies). Same list whether or not the push reached the phone.
export const GET = handler(async (req) => {
  const user = await requireUser(req);
  await appReady();
  const audiences = ["all", `user:${Number(user.id)}`, ...(user.role !== "member" ? ["volunteers"] : [])];
  const rows = await db()`select id, kind, ref_id, title, body, sent_at from app_notifications where audience = any(${audiences}) order by sent_at desc limit 50`;
  return Response.json({ notifications: rows.map((r) => ({ ...r, id: Number(r.id), ref_id: r.ref_id == null ? null : Number(r.ref_id) })) }, { headers: { "Cache-Control": "private, no-store" } });
});
