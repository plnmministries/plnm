import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { userFromRequest } from "@/lib/app/auth";
import { handler } from "@/lib/app/http";
import { getContent } from "@/lib/content";
import { getLiveStatus } from "@/lib/youtube-live";
import { upcomingEvents } from "@/lib/util";

// Everything the home screen needs in one call.
export const GET = handler(async (req) => {
  await appReady();
  const sql = db();
  const user = await userFromRequest(req);
  const [content, prayer, updates, live] = await Promise.all([
    getContent(),
    sql`select id, video_id, title, for_date::text as for_date, published_at from app_daily_prayers where not hidden and published_at <= now() order by for_date desc, published_at desc limit 1`,
    sql`select id, title, body, image, link, published_at from app_updates where not hidden and published_at <= now() order by published_at desc limit 3`,
    getLiveStatus(await getContent().then((c) => c.settings.youtubeChannelId)).catch(() => ({ live: false, videoId: null, next: null })),
  ]);
  let unreadReplies = 0;
  let openRequestsForTeam = 0;
  if (user) {
    const r = await sql`select count(*)::int as n from app_prayer_requests where user_id = ${user.id} and reply is not null and not reply_seen`;
    unreadReplies = Number(r[0].n);
    if (user.role !== "member") {
      const o = await sql`select count(*)::int as n from app_prayer_requests where status = 'new'`;
      openRequestsForTeam = Number(o[0].n);
    }
  }
  return Response.json({
    todayPrayer: prayer[0] || null,
    updates,
    live,
    nextEvent: upcomingEvents(content)[0] || null,
    unreadReplies,
    openRequestsForTeam,
  });
});
