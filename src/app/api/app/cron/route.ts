import { getContent } from "@/lib/content";
import { announcePendingPrayers, syncDailyPrayers } from "@/lib/app/daily";
import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";

// Scheduled job (GitHub Actions, see .github/workflows/app-cron.yml), also runnable from the admin:
// pulls new Daily Word videos from YouTube and sends the notification for the newest one.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (!secret || given !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await appReady();
  const { settings } = await getContent();
  const result = { added: 0, notified: 0, error: "" };
  try {
    result.added = await syncDailyPrayers(settings.youtubeChannelId);
  } catch (e) {
    result.error = (e as Error).message;
  }
  result.notified = await announcePendingPrayers();
  // expire old login codes
  await db()`delete from app_otps where expires_at < now()`;
  return Response.json({ ok: true, ...result, at: new Date().toISOString() });
}
