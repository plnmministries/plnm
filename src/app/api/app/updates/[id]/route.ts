import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { fail, handler } from "@/lib/app/http";

export const GET = handler(async (_req, ctx: RouteContext<"/api/app/updates/[id]">) => {
  await appReady();
  const { id } = await ctx.params;
  const rows = await db()`select id, title, body, image, link, published_at from app_updates where id = ${Number(id)} and not hidden`;
  if (!rows.length) return fail("Update not found", 404);
  return Response.json({ update: rows[0] });
});
