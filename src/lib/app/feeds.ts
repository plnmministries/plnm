import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "../db";
import { getContent } from "../content";
import { liveStatus } from "../live-status";
import { upcomingEvents } from "../util";
import { appReady } from "./schema";

// The app's read-only feeds (daily prayers, updates, the home screen) are served from Next's data
// cache, the same way the website's content is (src/lib/content.ts): one database read an hour at
// most, shared by every phone, however many open the app when the morning notification goes out.
// The scheduler and the admin expire the right tag the moment something changes (expireFeed), so
// nobody waits for the hour. Routes add Cache-Control (feedResponse) so Vercel's CDN also answers
// signed-out requests without running any code; requests with a sign-in token always reach the
// function and get the freshest cached copy.

export const DAILY_TAG = "app-daily";
export const UPDATES_TAG = "app-updates";
export type FeedTag = typeof DAILY_TAG | typeof UPDATES_TAG;

export const FEED_SECONDS = 3600;
export const DAILY_FEED = 30;
export const UPDATES_FEED = 50;
/** The app paginates both lists 20 at a time (?before=<id>). */
export const PAGE = 20;

export type FeedPrayer = { id: number; video_id: string; title: string; for_date: string; published_at: string; source: string; replies: number };
export type FeedUpdate = { id: number; title: string; body: string; image: string | null; link: string | null; published_at: string };

// the data cache stores JSON, so dates are kept as ISO strings from the first call on
const iso = (d: unknown) => new Date(d as string).toISOString();

/** Latest daily prayers the app may show, newest first. */
export const latestDaily = unstable_cache(
  async (): Promise<FeedPrayer[]> => {
    await appReady();
    const rows = (await db()`
      select p.id, p.video_id, p.title, p.for_date::text as for_date, p.published_at, p.source,
             (select count(*)::int from app_prayer_replies r where r.prayer_id = p.id) as replies
      from app_daily_prayers p
      where not p.hidden and p.published_at <= now()
      order by p.for_date desc, p.id desc limit ${DAILY_FEED}`) as FeedPrayer[];
    return rows.map((r) => ({ ...r, id: Number(r.id), published_at: iso(r.published_at) }));
  },
  ["plnm-app-daily"],
  { tags: [DAILY_TAG], revalidate: FEED_SECONDS },
);

/** Latest church updates / posters the app may show, newest first. */
export const latestUpdates = unstable_cache(
  async (): Promise<FeedUpdate[]> => {
    await appReady();
    const rows = (await db()`
      select id, title, body, image, link, published_at from app_updates
      where not hidden and published_at <= now()
      order by published_at desc, id desc limit ${UPDATES_FEED}`) as FeedUpdate[];
    return rows.map((r) => ({ ...r, id: Number(r.id), published_at: iso(r.published_at) }));
  },
  ["plnm-app-updates"],
  { tags: [UPDATES_TAG], revalidate: FEED_SECONDS },
);

/**
 * What the scheduler needs on a quiet run without opening the database: the video ids already
 * stored (hidden ones too) and whether an auto-synced prayer is still waiting to be announced.
 * Only changes when prayers change, and everything that changes them expires the daily tag.
 */
export const schedulerView = unstable_cache(
  async (): Promise<{ known: string[]; pending: boolean }> => {
    await appReady();
    const sql = db();
    const [known, pending] = await Promise.all([
      sql`select video_id from app_daily_prayers order by id desc limit 50`,
      sql`select 1 from app_daily_prayers where notified_at is null and source = 'auto' and not hidden and published_at <= now() limit 1`,
    ]);
    return { known: known.map((r) => r.video_id as string), pending: pending.length > 0 };
  },
  ["plnm-app-daily-scheduler"],
  { tags: [DAILY_TAG], revalidate: false },
);

/** A page of a cached feed; `complete` is false when the feed ran out and the database may hold more. */
export function pageOf<T extends { id: number }>(feed: T[], before: number | null, size: number) {
  const page = (before ? feed.filter((x) => x.id < before) : feed).slice(0, PAGE);
  return { page, complete: page.length === PAGE || feed.length < size };
}

/** The Word for today an admin last set (null until one is set; the app then shows its own daily verse). */
export const latestVerse = unstable_cache(
  async (): Promise<{ text: string; reference: string; setAt: string } | null> => {
    await appReady();
    const rows = await db()`select text, reference, created_at from app_verses order by id desc limit 1`;
    return rows.length ? { text: rows[0].text as string, reference: rows[0].reference as string, setAt: iso(rows[0].created_at) } : null;
  },
  ["plnm-app-verse"],
  { tags: [DAILY_TAG], revalidate: FEED_SECONDS },
);

/** The home screen's shared part: nothing here depends on who is asking. */
export async function homeFeed() {
  const [content, prayers, updates, live, verse] = await Promise.all([getContent(), latestDaily(), latestUpdates(), liveStatus(), latestVerse().catch(() => null)]); // the verse is never worth failing Home for
  return { todayPrayer: prayers[0] ?? null, updates: updates.slice(0, 3), live, nextEvent: upcomingEvents(content)[0] ?? null, verse };
}

/** Drops a cached feed so the very next request reads the database. Call after changing daily prayers or updates. */
export function expireFeed(tag: FeedTag) {
  revalidateTag(tag, { expire: 0 });
}

/** Phones keep a feed for a minute, Vercel's CDN for five, and serve it stale for ten more while refreshing. */
export const FEED_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const feedResponse = (data: unknown) => Response.json(data, { headers: { "Cache-Control": FEED_CACHE_CONTROL } });
