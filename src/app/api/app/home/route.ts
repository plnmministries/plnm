import { after } from "next/server";
import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { userFromRequest } from "@/lib/app/auth";
import { handler } from "@/lib/app/http";
import { feedResponse, homeFeed } from "@/lib/app/feeds";
import { maybeSyncDaily } from "@/lib/app/autosync";

// Everything the home screen needs in one call. The feed itself comes from the cache (no database
// read); a signed-in user additionally gets their own counters and the message pinned on their Home
// (the latest admin announcement or church update), and that response is never shared.
export const GET = handler(async (req) => {
  after(maybeSyncDaily);
  const [home, user] = await Promise.all([homeFeed(), userFromRequest(req)]);
  if (!user) return feedResponse({ ...home, unreadReplies: 0, openRequestsForTeam: 0, pinned: null });
  await appReady();
  const sql = db();
  const team = user.role !== "member";
  const audiences = ["all", `user:${Number(user.id)}`, ...(team ? ["volunteers"] : [])];
  const [[c], [note], [update]] = await Promise.all([
    sql`select (select count(*)::int from app_prayer_requests where user_id = ${user.id} and reply is not null and not reply_seen) as unread,
               ${team ? sql`(select count(*)::int from app_prayer_requests where status = 'new')` : sql`0`} as open`,
    sql`select id, title, body, sent_at as at from app_notifications where kind = 'custom' and audience = any(${audiences}) order by sent_at desc limit 1`,
    sql`select id, title, body, image, published_at as at from app_updates where not hidden and published_at <= now() order by published_at desc, id desc limit 1`,
  ]);
  // whichever is newer: an announcement sent from "Send a notification", or the latest posted update
  const candidates = [
    note && { kind: "announcement", id: Number(note.id), title: note.title, body: note.body, image: null, at: new Date(note.at).toISOString() },
    update && { kind: "update", id: Number(update.id), title: update.title, body: update.body, image: update.image, at: new Date(update.at).toISOString() },
  ].filter(Boolean) as { at: string }[];
  const pinned = candidates.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  return Response.json({ ...home, unreadReplies: Number(c.unread), openRequestsForTeam: Number(c.open), pinned }, { headers: { "Cache-Control": "private, no-store" } });
});
