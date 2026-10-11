import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { handler, num } from "@/lib/app/http";
import { DAILY_FEED, PAGE, feedResponse, latestDaily, pageOf } from "@/lib/app/feeds";

// Daily prayers, newest first, 20 at a time (?before=<id> for the next page).
// The first page comes from the cached feed (same data as /api/app/daily); scrolling further reads the database.
export const GET = handler(async (req) => {
  const before = num(new URL(req.url).searchParams.get("before"));
  const { page, complete } = pageOf(await latestDaily(), before, DAILY_FEED);
  if (complete) return feedResponse({ prayers: page });
  await appReady();
  const rows = await db()`
    select p.id, p.video_id, p.title, p.for_date::text as for_date, p.published_at, p.source,
           (select count(*)::int from app_prayer_replies r where r.prayer_id = p.id) as replies
    from app_daily_prayers p
    where not p.hidden and p.published_at <= now() ${before ? db()`and p.id < ${before}` : db()``}
    order by p.for_date desc, p.id desc limit ${PAGE}`;
  return feedResponse({ prayers: rows });
});
