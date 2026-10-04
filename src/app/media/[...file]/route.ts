import path from "path";
import { hasDb, mediaGet } from "@/lib/db";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif" };
const HEADERS = { "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" };

// Images uploaded in the admin: read from the shared database, or proxied from the admin app.
export async function GET(_req: Request, ctx: RouteContext<"/media/[...file]">) {
  const { file } = await ctx.params;
  const name = path.basename(file.join("/"));
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type) return new Response("Not found", { status: 404 });
  if (hasDb()) {
    const m = await mediaGet(name);
    return m ? new Response(new Uint8Array(m.data), { headers: { "Content-Type": m.type, ...HEADERS } }) : new Response("Not found", { status: 404 });
  }
  const admin = process.env.CONTENT_API_URL?.replace(/\/$/, "");
  if (!admin) return new Response("Not found", { status: 404 });
  const r = await fetch(`${admin}/media/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) return new Response("Not found", { status: 404 });
  return new Response(await r.arrayBuffer(), { headers: { "Content-Type": type, ...HEADERS } });
}
