import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { fail, handler, requireUser } from "@/lib/app/http";
import { SELFIE_DAYS, signedGet, storageConfigured } from "@/lib/app/storage";

// The selfie taken at check-in: redirects to a 10-minute signed R2 URL. Owner or admin only.
// R2 deletes selfies after 15 days (lifecycle rule), so older check-ins answer 404 {error:"expired"}
// without touching storage; the attendance row itself is kept.
export const GET = handler(async (req, ctx: RouteContext<"/api/app/attendance/[id]/selfie">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return fail("Check-in not found", 404);
  await appReady();
  const rows = await db()`select user_id, check_in_at, selfie_key from app_attendance where id = ${Number(id)}`;
  const a = rows[0];
  if (!a) return fail("Check-in not found", 404);
  if (Number(a.user_id) !== Number(user.id) && user.role !== "admin") return fail("Not allowed", 403);
  if (Date.now() - new Date(a.check_in_at as string).getTime() > SELFIE_DAYS * 86_400_000) return fail("expired", 404);
  if (!a.selfie_key) return fail("No selfie for this check-in", 404);
  if (!storageConfigured()) return fail("Storage is not configured", 503);
  return new Response(null, { status: 302, headers: { Location: await signedGet(a.selfie_key as string), "Cache-Control": "private, no-store" } });
});
