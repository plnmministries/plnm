import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { DAILY_TAG, expireFeed, latestVerse } from "@/lib/app/feeds";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

// The Word for today on everyone's home screen: an admin types or pastes it (any language) with its reference.
export const GET = handler(async (req) => {
  await requireUser(req, ["admin"]);
  return Response.json({ verse: await latestVerse() });
});

export const POST = handler(async (req) => {
  const me = await requireUser(req, ["admin"]);
  const b = await body(req);
  const text = str(b.text, 1500).replace(/^[“"']+|[”"']+$/g, "").trim();
  if (text.length < 3) return fail("Please paste the verse");
  const reference = str(b.reference, 120);
  await appReady();
  await db()`insert into app_verses (text, reference, created_by) values (${text}, ${reference}, ${me.id})`;
  expireFeed(DAILY_TAG);
  return Response.json({ verse: { text, reference } }, { status: 201 });
});
