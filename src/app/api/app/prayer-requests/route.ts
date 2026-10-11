import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

// My prayer requests (marks any replies as seen).
export const GET = handler(async (req) => {
  const user = await requireUser(req);
  await appReady();
  const rows = await db()`select id, text, status, reply, replied_at, created_at from app_prayer_requests where user_id = ${user.id} order by created_at desc limit 100`;
  await db()`update app_prayer_requests set reply_seen = true where user_id = ${user.id} and reply is not null and not reply_seen`;
  return Response.json({ requests: rows });
});

// Send a prayer request to the church.
export const POST = handler(async (req) => {
  const user = await requireUser(req);
  await appReady();
  const text = str((await body(req)).text, 2000);
  if (text.length < 5) return fail("Please tell us a little more so we can pray with you");
  const today = await db()`select count(*)::int as n from app_prayer_requests where user_id = ${user.id} and created_at > now() - interval '1 day'`;
  if (Number(today[0].n) >= 5) return fail("You've sent 5 requests today. Please try again tomorrow.", 429);
  const rows = await db()`insert into app_prayer_requests (user_id, text) values (${user.id}, ${text}) returning id, text, status, created_at`;
  return Response.json({ request: rows[0] });
});
