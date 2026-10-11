import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { handler, num } from "@/lib/app/http";
import { PAGE, UPDATES_FEED, feedResponse, latestUpdates, pageOf } from "@/lib/app/feeds";

// Church updates / posters, newest first, 20 at a time (?before=<id> for the next page).
// The first pages come from the cached feed; only scrolling past its 50 entries reads the database.
export const GET = handler(async (req) => {
  const before = num(new URL(req.url).searchParams.get("before"));
  const { page, complete } = pageOf(await latestUpdates(), before, UPDATES_FEED);
  if (complete) return feedResponse({ updates: page });
  await appReady();
  const rows = await db()`
    select id, title, body, image, link, published_at from app_updates
    where not hidden and published_at <= now() ${before ? db()`and id < ${before}` : db()``}
    order by published_at desc, id desc limit ${PAGE}`;
  return feedResponse({ updates: rows });
});
