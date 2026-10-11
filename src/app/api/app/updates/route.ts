import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { handler, num } from "@/lib/app/http";

// Church updates / posters, newest first.
export const GET = handler(async (req) => {
  await appReady();
  const before = num(new URL(req.url).searchParams.get("before"));
  const rows = await db()`
    select id, title, body, image, link, published_at from app_updates
    where not hidden and published_at <= now() ${before ? db()`and id < ${before}` : db()``}
    order by published_at desc, id desc limit 20`;
  return Response.json({ updates: rows });
});
