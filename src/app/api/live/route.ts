import { liveStatus } from "@/lib/live-status";

// Is the church's YouTube channel live, and when is the next scheduled stream?
// The lookup (and its one-minute memory cache) lives in src/lib/live-status.ts, shared with the app's home feed.
export async function GET() {
  return Response.json(await liveStatus());
}
