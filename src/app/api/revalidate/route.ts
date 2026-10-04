import { revalidateTag } from "next/cache";
import { CONTENT_TAG } from "@/lib/content";

// Called by the admin app after Publish so the new content shows on the very next request.
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  revalidateTag(CONTENT_TAG, { expire: 0 });
  return Response.json({ ok: true });
}
