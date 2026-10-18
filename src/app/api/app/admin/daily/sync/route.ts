import { getContent } from "@/lib/content";
import { announcePendingPrayers, syncDailyPrayers } from "@/lib/app/daily";
import { handler, requireUser } from "@/lib/app/http";

export const maxDuration = 60;

// "Check YouTube now": the same work as the scheduler's tick, started by an admin.
export const POST = handler(async (req) => {
  await requireUser(req, ["admin"]);
  const channel = process.env.YOUTUBE_CHANNEL_ID || (await getContent()).settings.youtubeChannelId;
  const added = await syncDailyPrayers(channel);
  const notified = await announcePendingPrayers(added > 0);
  return Response.json({ added, notified });
});
