import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { handler, requireUser } from "@/lib/app/http";

// Prayer team inbox (volunteers + admin): open requests first.
export const GET = handler(async (req) => {
  await requireUser(req, ["volunteer", "admin"]);
  await appReady();
  const status = new URL(req.url).searchParams.get("status") || "new";
  const rows = await db()`
    select r.id, r.text, r.status, r.reply, r.replied_at, r.created_at, u.name, u.phone, u.email,
           (select name from app_users a where a.id = r.replied_by) as replied_by_name
    from app_prayer_requests r join app_users u on u.id = r.user_id
    where ${status === "all" ? db()`true` : db()`r.status = ${status}`}
    order by r.created_at desc limit 200`;
  return Response.json({ requests: rows });
});
