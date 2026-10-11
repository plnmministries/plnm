import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { fail, handler, requireUser } from "@/lib/app/http";

export const POST = handler(async (req) => {
  const user = await requireUser(req, ["volunteer", "admin"]);
  await appReady();
  const rows = await db()`update app_attendance set check_out_at = now() where user_id = ${user.id} and check_out_at is null returning id, check_in_at, check_out_at`;
  if (!rows.length) return fail("You're not checked in");
  return Response.json({ attendance: rows[0] });
});
