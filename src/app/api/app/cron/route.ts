import { getContent } from "@/lib/content";
import { announcePendingPrayers, syncDailyPrayers } from "@/lib/app/daily";
import { fail, handler } from "@/lib/app/http";

// The scheduler's tick (a Cloudflare Worker, scripts/cron-worker.js, or cron-job.org; see the README):
// pulls new Daily Word videos from YouTube and sends the notification for the newest one.
// A quiet tick answers from the cache and never opens the database, so Neon can stay asleep.
export const maxDuration = 60;

const tick = handler(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return fail("Unauthorized", 401);
  const channel = process.env.YOUTUBE_CHANNEL_ID || (await getContent()).settings.youtubeChannelId;
  const result = { added: 0, notified: 0, error: "" };
  try {
    result.added = await syncDailyPrayers(channel);
  } catch (e) {
    result.error = (e as Error).message;
  }
  result.notified = await announcePendingPrayers(result.added > 0);
  return Response.json({ ok: true, ...result, at: new Date().toISOString() });
});

export const GET = tick;
export const POST = tick;
