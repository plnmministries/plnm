import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { notify } from "@/lib/app/push";
import { UPDATES_TAG, expireFeed } from "@/lib/app/feeds";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

// Post a church update / announcement to the app, optionally with a notification to everyone.
export const POST = handler(async (req) => {
  await requireUser(req, ["admin"]);
  const b = await body(req);
  const title = str(b.title, 120);
  if (!title) return fail("Please add a title");
  const text = str(b.body, 4000);
  const link = str(b.link, 500);
  if (link && !/^https?:\/\//i.test(link)) return fail("The link should start with https://");
  await appReady();
  const sql = db();
  const rows = await sql`insert into app_updates (title, body, link) values (${title}, ${text}, ${link || null}) returning id`;
  const id = Number(rows[0].id);
  expireFeed(UPDATES_TAG);
  let sent = 0;
  if (b.notify === true) {
    sent = await notify("all", title, text || "New update from the church", { kind: "update", id });
    await sql`update app_updates set notified_at = now() where id = ${id}`;
  }
  return Response.json({ id, sent }, { status: 201 });
});
