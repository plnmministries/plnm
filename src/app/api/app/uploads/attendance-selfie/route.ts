import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { body, fail, handler, num, requireUser } from "@/lib/app/http";
import { attendanceKey, presignUpload, SELFIE_MAX_BYTES, SELFIE_WINDOW_MINUTES, storageConfigured } from "@/lib/app/storage";

// Check-in selfie: a 5-minute presigned PUT for attendance/{YYYY-MM-DD}/{attendanceId}.jpg, only for
// the caller's own check-in and only within 15 minutes of it (so the proof can't be swapped later).
// The key is stored right away; GET /api/app/attendance/{id}/selfie serves it (owner or admin)
// until the bucket's lifecycle rule deletes it after 15 days. Attendance rows are kept forever.
export const POST = handler(async (req) => {
  const user = await requireUser(req, ["volunteer", "admin"]);
  if (!storageConfigured()) return fail("Storage is not configured", 503);
  const b = await body(req);
  const id = num(b.attendanceId);
  const size = num(b.size);
  if (id == null || !Number.isInteger(id)) return fail("attendanceId is required");
  if (size == null || !Number.isInteger(size) || size <= 0) return fail("Send the selfie's size in bytes as `size`");
  if (size > SELFIE_MAX_BYTES) return fail("Selfie is too large (max 3 MB)");
  await appReady();
  const sql = db();
  const rows = await sql`select check_in_at from app_attendance where id = ${id} and user_id = ${user.id}`;
  if (!rows.length) return fail("Check-in not found", 404);
  const checkInAt = new Date(rows[0].check_in_at as string);
  if (Date.now() - checkInAt.getTime() > SELFIE_WINDOW_MINUTES * 60_000) return fail(`A selfie can only be added within ${SELFIE_WINDOW_MINUTES} minutes of checking in`);
  const key = attendanceKey(checkInAt, id);
  const upload = await presignUpload(key, "image/jpeg", SELFIE_MAX_BYTES, size);
  await sql`update app_attendance set selfie_key = ${key} where id = ${id}`;
  return Response.json({ upload, key });
});
