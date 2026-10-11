import "server-only";
import { unstable_cache } from "next/cache";
import type { SiteContent } from "./types";
import { createSeed } from "./seed";
import { hasDb, kvGet } from "./db";
import { migrate } from "./migrate";

// The public website doesn't store content itself. It reads the PUBLISHED content:
//   1. straight from the shared database (DATABASE_URL, Neon), so it never waits on the admin app, or
//   2. from the admin app at CONTENT_API_URL/api/public/content.
// The result sits in Next's data cache (shared by pages and route handlers) under the "content" tag;
// Publish in the admin calls /api/revalidate, which expires that tag so changes show on the next request.
// Because Publish does that on demand, the timed revalidation is only a safety net: an hour instead of
// a minute means the site (and the app's /api/app/content) wakes the Neon database at most 24 times
// a day for content, which keeps it inside the free plan's compute hours.

export const CONTENT_TAG = "content";

const base = () => process.env.CONTENT_API_URL?.replace(/\/$/, "");

const fetchPublished = unstable_cache(
  async (): Promise<SiteContent> => {
    if (hasDb()) {
      const data = await kvGet<SiteContent>("published");
      // nothing published yet (admin never opened): show the starter content
      return data ?? createSeed();
    }
    const r = await fetch(`${base()}/api/public/content`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`admin returned ${r.status}`);
    return r.json();
  },
  ["plnm-published-content"],
  { tags: [CONTENT_TAG], revalidate: 3600 },
);

// last successful copy, so a brief admin outage never takes the site down
const g = globalThis as { __plnmLastGood?: SiteContent };

export async function getContent(): Promise<SiteContent> {
  if (!hasDb() && !base()) {
    console.warn("[content] neither DATABASE_URL nor CONTENT_API_URL is set; showing the starter content");
    return createSeed();
  }
  try {
    // apply one-time updates (e.g. new sections) even before the admin next publishes
    const data = migrate(await fetchPublished());
    g.__plnmLastGood = data;
    return data;
  } catch (e) {
    console.error("[content] couldn't load content from the admin app:", (e as Error).message);
    return g.__plnmLastGood ?? createSeed();
  }
}
