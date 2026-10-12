import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { body, fail, handler, num, requireUser } from "@/lib/app/http";
import { attendanceKey, objectSize, storageConfigured } from "@/lib/app/storage";

// Check-in selfie, step 2 of 2: once the PUT succeeded, attach the selfie to the caller's own check-in.
// The row only gets selfie_key when the object really is in the bucket, so a failed upload never leaves
// `has_selfie` true or an admin link that answers 404.
export const POST = handler(async (req) => {
  const user = await requireUser(req, ["volunteer", "admin"]);
  if (!storageConfigured()) return fail("Storage is not configured", 503);
  const id = num((await body(req)).attendanceId);
  if (id == null || !Number.isInteger(id)) return fail("attendanceId is required");
  await appReady();
  const sql = db();
  const rows = await sql`select check_in_at from app_attendance where id = ${id} and user_id = ${user.id}`;
  if (!rows.length) return fail("Check-in not found", 404);
  const key = attendanceKey(new Date(rows[0].check_in_at as string), id);
  if ((await objectSize(key)) == null) return fail("The selfie hasn't been uploaded yet. Please try again.");
  await sql`update app_attendance set selfie_key = ${key} where id = ${id}`;
  return Response.json({ ok: true, key });
});
