import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { body, fail, handler, num, requireUser, str } from "@/lib/app/http";

// My attendance history + whether I'm currently checked in.
export const GET = handler(async (req) => {
  const user = await requireUser(req, ["volunteer", "admin"]);
  await appReady();
  const rows = await db()`select id, check_in_at, check_out_at, lat, lng, accuracy, biometric, note, (selfie_key is not null) as has_selfie from app_attendance where user_id = ${user.id} order by check_in_at desc limit 60`;
  return Response.json({ attendance: rows, open: rows.find((r) => !r.check_out_at) || null });
});

// Check in: Face ID / fingerprint result and GPS position. The selfie is uploaded straight to R2 afterwards:
// POST /api/app/uploads/attendance-selfie with the returned attendance id (within 15 minutes).
export const POST = handler(async (req) => {
  const user = await requireUser(req, ["volunteer", "admin"]);
  await appReady();
  const sql = db();
  const b = await body(req);
  const lat = num(b.lat);
  const lng = num(b.lng);
  if (lat == null || lng == null) return fail("Location is required to check in. Please allow location access.");
  // close anything left open (forgotten check-out) before starting a new session
  await sql`update app_attendance set check_out_at = least(now(), check_in_at + interval '12 hours') where user_id = ${user.id} and check_out_at is null`;
  const rows = await sql`
    insert into app_attendance (user_id, lat, lng, accuracy, biometric, device, note)
    values (${user.id}, ${lat}, ${lng}, ${num(b.accuracy)}, ${b.biometric === true}, ${str(b.device, 120)}, ${str(b.note, 200)})
    returning id, check_in_at`;
  return Response.json({ attendance: rows[0] });
});
