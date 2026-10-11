import { getContent } from "@/lib/content";

// The published website content (sermons, events, giving, forms, translations…) for the app.
export async function GET() {
  const c = await getContent();
  return Response.json(c, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
}
