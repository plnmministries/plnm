import { db } from "@/lib/db";
import { publicUser } from "@/lib/app/schema";
import { body, fail, handler, requireUser, str } from "@/lib/app/http";

export const GET = handler(async (req) => Response.json({ user: publicUser(await requireUser(req)) }));

// Update own profile (name, phone, language). The photo changes through POST /api/app/uploads/avatar (+ confirm).
export const PUT = handler(async (req) => {
  const user = await requireUser(req);
  const b = await body(req);
  const name = b.name !== undefined ? str(b.name, 80) : user.name;
  const phone = b.phone !== undefined ? str(b.phone, 20).replace(/[^\d+ ]/g, "") : user.phone;
  const lang = ["en", "te", "hi"].includes(String(b.lang)) ? String(b.lang) : user.lang;
  if (b.photo !== undefined) return fail("Use /api/app/uploads/avatar to change the photo");
  if (b.name !== undefined && name.length < 2) return fail("Please enter your name");
  const rows = await db()`update app_users set name = ${name}, phone = ${phone || null}, lang = ${lang} where id = ${user.id} returning *`;
  return Response.json({ user: publicUser(rows[0] as never) });
});

// Sign out everywhere (invalidates every token for this account).
export const DELETE = handler(async (req) => {
  const user = await requireUser(req);
  await db()`update app_users set token_version = token_version + 1 where id = ${user.id}`;
  await db()`delete from app_push_tokens where user_id = ${user.id}`;
  return Response.json({ ok: true });
});
