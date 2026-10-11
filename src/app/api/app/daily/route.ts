import { handler } from "@/lib/app/http";
import { feedResponse, latestDaily } from "@/lib/app/feeds";

// The latest 30 daily prayers, newest first, straight from the cache (public: shared by every phone and the CDN).
export const GET = handler(async () => feedResponse({ prayers: await latestDaily() }));
