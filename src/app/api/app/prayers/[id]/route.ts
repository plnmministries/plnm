import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { fail, handler } from "@/lib/app/http";

export const GET = handler(async (_req, ctx: RouteContext<"/api/app/prayers/[id]">) => {
  await appReady();
  const { id } = await ctx.params;
  const rows = await db()`
    select p.id, p.video_id, p.title, p.for_date::text as for_date, p.published_at, p.source,
           (select count(*)::int from app_prayer_replies r where r.prayer_id = p.id) as replies
    from app_daily_prayers p where p.id = ${Number(id)} and not p.hidden`;
  if (!rows.length) return fail("Prayer not found", 404);
  return Response.json({ prayer: rows[0] });
});
