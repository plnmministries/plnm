import "server-only";
import { unstable_cache } from "next/cache";
import type { SiteContent } from "./types";
import { createSeed } from "./seed";

// The public website doesn't store content itself: it reads the PUBLISHED content from the
// admin app (plnmadmin) at CONTENT_API_URL/api/public/content. The result sits in Next's data
// cache (shared by pages and route handlers) under the "content" tag; Publish in the admin calls
// /api/revalidate, which expires that tag so changes show on the next request.

export const CONTENT_TAG = "content";

const base = () => process.env.CONTENT_API_URL?.replace(/\/$/, "");

const fetchPublished = unstable_cache(
  async (): Promise<SiteContent> => {
    const r = await fetch(`${base()}/api/public/content`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`admin returned ${r.status}`);
    return r.json();
  },
  ["plnm-published-content"],
  { tags: [CONTENT_TAG], revalidate: 60 },
);

// last successful copy, so a brief admin outage never takes the site down
const g = globalThis as { __plnmLastGood?: SiteContent };

export async function getContent(): Promise<SiteContent> {
  if (!base()) {
    console.warn("[content] CONTENT_API_URL is not set; showing the starter content");
    return createSeed();
  }
  try {
    const data = await fetchPublished();
    g.__plnmLastGood = data;
    return data;
  } catch (e) {
    console.error("[content] couldn't load content from the admin app:", (e as Error).message);
    return g.__plnmLastGood ?? createSeed();
  }
}
