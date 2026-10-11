import { revalidateTag } from "next/cache";
import { CONTENT_TAG } from "@/lib/content";
import { DAILY_TAG, UPDATES_TAG, expireFeed } from "@/lib/app/feeds";

// Called by the admin app after Publish so the new content shows on the very next request.
// With ?tag=app-daily and/or ?tag=app-updates it drops the app's cached feeds instead: the admin
// calls it after adding, hiding or deleting a daily prayer or an update (see src/lib/app/feeds.ts).
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const tags = new URL(req.url).searchParams.getAll("tag");
  const unknown = tags.find((t) => t !== CONTENT_TAG && t !== DAILY_TAG && t !== UPDATES_TAG);
  if (unknown) return Response.json({ error: `Unknown tag: ${unknown}` }, { status: 400 });
  if (!tags.length || tags.includes(CONTENT_TAG)) revalidateTag(CONTENT_TAG, { expire: 0 });
  if (tags.includes(DAILY_TAG)) expireFeed(DAILY_TAG);
  if (tags.includes(UPDATES_TAG)) expireFeed(UPDATES_TAG);
  return Response.json({ ok: true });
}
