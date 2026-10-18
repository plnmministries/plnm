import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { notify } from "@/lib/app/push";
import { pushTextFor } from "@/lib/app/daily";
import { videoTitle } from "@/lib/app/youtube-videos";
import { DAILY_TAG, expireFeed } from "@/lib/app/feeds";
import { indiaToday } from "@/lib/app/admin";
import { cleanTitle, parseYouTubeId } from "@/lib/util";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

// Today's prayer from a YouTube link (for days the video isn't a "Daily Word" upload, or arrives late).
export const POST = handler(async (req) => {
  await requireUser(req, ["admin"]);
  const b = await body(req);
  const videoId = parseYouTubeId(str(b.url, 300));
  if (!videoId) return fail("That doesn't look like a YouTube link");
  const title = str(b.title, 200) || cleanTitle(await videoTitle(videoId).catch(() => "")) || "Today's prayer";
  await appReady();
  const sql = db();
  const rows = await sql`insert into app_daily_prayers (video_id, title, for_date, source)
                         values (${videoId}, ${title}, ${indiaToday()}, 'manual')
                         on conflict (video_id) do update set title = excluded.title, for_date = excluded.for_date, hidden = false
                         returning id`;
  const id = Number(rows[0].id);
  let sent = 0;
  if (b.notify === true) {
    const t = pushTextFor(title);
    sent = await notify("all", t.title, t.body, { kind: "daily", id });
    await sql`update app_daily_prayers set notified_at = now() where id = ${id}`;
  }
  expireFeed(DAILY_TAG);
  return Response.json({ id, title, sent }, { status: 201 });
});
