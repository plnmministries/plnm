import { db } from "@/lib/db";
import { handler, requireUser } from "@/lib/app/http";

// Sign out everywhere: invalidates every token for this account and drops its push tokens.
export const POST = handler(async (req) => {
  const user = await requireUser(req);
  await db()`update app_users set token_version = token_version + 1 where id = ${user.id}`;
  await db()`delete from app_push_tokens where user_id = ${user.id}`;
  return Response.json({ ok: true });
});
