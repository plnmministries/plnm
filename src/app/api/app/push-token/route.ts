import { db } from "@/lib/db";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

// Register (or move) this device's Expo push token to the signed-in user.
export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const b = await body(req);
  const token = str(b.token, 200);
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) return fail("Invalid push token");
  await db()`insert into app_push_tokens (token, user_id, platform) values (${token}, ${user.id}, ${str(b.platform, 20)})
             on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()`;
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req) => {
  const user = await requireUser(req);
  const { token } = await body(req);
  await db()`delete from app_push_tokens where token = ${str(token, 200)} and user_id = ${user.id}`;
  return Response.json({ ok: true });
});
