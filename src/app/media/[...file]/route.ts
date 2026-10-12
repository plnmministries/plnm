import path from "path";
import { hasDb, mediaGet } from "@/lib/db";
import { mediaKey, publicUrl, storageConfigured } from "@/lib/app/storage";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif" };
const HEADERS = { "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" };

// Images uploaded in the admin. Older uploads are read from the shared database; newer ones live in
// Cloudflare R2 (redirect to R2_PUBLIC_URL/media/…); without either, they are proxied from the admin app.
export async function GET(_req: Request, ctx: RouteContext<"/media/[...file]">) {
  const { file } = await ctx.params;
  const name = path.basename(file.join("/"));
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type) return new Response("Not found", { status: 404 });
  if (hasDb()) {
    const m = await mediaGet(name);
    if (m) return new Response(new Uint8Array(m.data), { headers: { "Content-Type": m.type, ...HEADERS } });
  }
  if (storageConfigured()) {
    return new Response(null, { status: 302, headers: { Location: publicUrl(mediaKey(name)), "Cache-Control": "public, max-age=86400" } });
  }
  if (hasDb()) return new Response("Not found", { status: 404 });
  const admin = process.env.CONTENT_API_URL?.replace(/\/$/, "");
  if (!admin) return new Response("Not found", { status: 404 });
  const r = await fetch(`${admin}/media/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) return new Response("Not found", { status: 404 });
  return new Response(await r.arrayBuffer(), { headers: { "Content-Type": type, ...HEADERS } });
}
