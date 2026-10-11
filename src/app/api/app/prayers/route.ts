import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { handler, num } from "@/lib/app/http";

// Daily prayers, newest first, 20 at a time (?before=<id> for the next page).
export const GET = handler(async (req) => {
  await appReady();
  const url = new URL(req.url);
  const before = num(url.searchParams.get("before"));
  const rows = await db()`
    select p.id, p.video_id, p.title, p.for_date::text as for_date, p.published_at, p.source,
           (select count(*)::int from app_prayer_replies r where r.prayer_id = p.id) as replies
    from app_daily_prayers p
    where not p.hidden and p.published_at <= now() ${before ? db()`and p.id < ${before}` : db()``}
    order by p.for_date desc, p.id desc limit 20`;
  return Response.json({ prayers: rows });
});
