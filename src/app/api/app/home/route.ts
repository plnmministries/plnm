import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { userFromRequest } from "@/lib/app/auth";
import { handler } from "@/lib/app/http";
import { feedResponse, homeFeed } from "@/lib/app/feeds";

// Everything the home screen needs in one call. The feed itself comes from the cache (no database
// read); a signed-in user additionally gets their own counters, and that response is never shared.
export const GET = handler(async (req) => {
  const [home, user] = await Promise.all([homeFeed(), userFromRequest(req)]);
  if (!user) return feedResponse({ ...home, unreadReplies: 0, openRequestsForTeam: 0 });
  await appReady();
  const [c] = await db()`
    select (select count(*)::int from app_prayer_requests where user_id = ${user.id} and reply is not null and not reply_seen) as unread,
           ${user.role !== "member" ? db()`(select count(*)::int from app_prayer_requests where status = 'new')` : db()`0`} as open`;
  return Response.json({ ...home, unreadReplies: Number(c.unread), openRequestsForTeam: Number(c.open) }, { headers: { "Cache-Control": "private, no-store" } });
});
