import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { avatarUrl } from "@/lib/app/storage";
import { handler, requireUser } from "@/lib/app/http";

export const GET = handler(async (req) => {
  await requireUser(req, ["admin"]);
  await appReady();
  const all = new URL(req.url).searchParams.get("status") === "all";
  const rows = await db()`
    select v.id, v.note, v.status, v.created_at, v.decided_at, u.id as user_id, u.name, u.username, u.email, u.phone, u.photo, u.role
    from app_volunteer_requests v join app_users u on u.id = v.user_id
    where ${all} or v.status = 'pending'
    order by (v.status = 'pending') desc, v.created_at desc limit 200`;
  return Response.json({ requests: rows.map((r) => ({ ...r, photo: avatarUrl(r.photo as string | null) })) });
});
