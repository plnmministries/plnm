import { publicUser } from "@/lib/app/schema";
import { handler, requireUser } from "@/lib/app/http";

// The signed-in profile; the app calls this on launch to check its stored token is still good.
export const GET = handler(async (req) => Response.json({ user: publicUser(await requireUser(req)) }));
