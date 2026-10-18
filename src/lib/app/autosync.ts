import "server-only";
import { getContent } from "../content";
import { announcePendingPrayers, syncDailyPrayers } from "./daily";

// A safety net for the daily prayer: whenever the app is in use, the server checks YouTube for a new
// "Daily Word" now and then (every 10 minutes in the morning, hourly otherwise), so prayers appear even if
// the external scheduler (scripts/cron-worker.js / cron-job.org) isn't set up or misses a tick. A check that
// finds nothing new costs one YouTube request and no database time. Runs after the response is sent.
const g = globalThis as { __plnmLastAutoSync?: number };

export async function maybeSyncDaily() {
  const hourIST = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  const every = hourIST >= 4 && hourIST < 12 ? 10 * 60_000 : 60 * 60_000;
  if (Date.now() - (g.__plnmLastAutoSync ?? 0) < every) return;
  g.__plnmLastAutoSync = Date.now();
  try {
    const channel = process.env.YOUTUBE_CHANNEL_ID || (await getContent()).settings.youtubeChannelId;
    const added = await syncDailyPrayers(channel);
    if (added) await announcePendingPrayers(true);
  } catch (e) {
    console.warn("[autosync]", (e as Error).message);
  }
}
