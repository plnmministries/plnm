import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { revalidateTag } from "next/cache";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";
import { avatarUrl } from "@/lib/app/storage";
import { DAILY_TAG } from "@/lib/app/feeds";

// Volunteer replies under a daily prayer (like a WhatsApp group). Members can't see or post them.
export const GET = handler(async (req, ctx: RouteContext<"/api/app/prayers/[id]/replies">) => {
  const user = await requireUser(req, ["volunteer", "admin"]);
  await appReady();
  const { id } = await ctx.params;
  const rows = await db()`
    select r.id, r.text, r.created_at, u.id as user_id, u.name, u.photo, u.role
    from app_prayer_replies r join app_users u on u.id = r.user_id
    where r.prayer_id = ${Number(id)} order by r.created_at asc limit 500`;
  return Response.json({ replies: rows.map((r) => ({ ...r, photo: avatarUrl(r.photo as string | null) })), me: Number(user.id) });
});

export const POST = handler(async (req, ctx: RouteContext<"/api/app/prayers/[id]/replies">) => {
  const user = await requireUser(req, ["volunteer", "admin"]);
  await appReady();
  const { id } = await ctx.params;
  const text = str((await body(req)).text, 1000);
  if (!text) return fail("Write something first");
  const exists = await db()`select 1 from app_daily_prayers where id = ${Number(id)} and not hidden`;
  if (!exists.length) return fail("Prayer not found", 404);
  const rows = await db()`insert into app_prayer_replies (prayer_id, user_id, text) values (${Number(id)}, ${user.id}, ${text}) returning id, text, created_at`;
  // the cached list shows a reply count; refresh it in the background rather than making anyone wait
  revalidateTag(DAILY_TAG, "max");
  return Response.json({ reply: { ...rows[0], user_id: Number(user.id), name: user.name, photo: avatarUrl(user.photo), role: user.role } });
});
