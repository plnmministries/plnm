import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { indiaToday } from "@/lib/app/admin";
import { handler, requireUser } from "@/lib/app/http";

// Check-ins for a day (India time; ?day=YYYY-MM-DD, default today) plus anyone still checked in.
export const GET = handler(async (req) => {
  await requireUser(req, ["admin"]);
  await appReady();
  const d = new URL(req.url).searchParams.get("day") || "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : indiaToday();
  const rows = await db()`
    select a.id, a.check_in_at, a.check_out_at, a.lat, a.lng, a.accuracy, a.biometric, (a.selfie_key is not null) as has_selfie,
           u.id as user_id, u.name, u.phone
    from app_attendance a join app_users u on u.id = a.user_id
    where (a.check_in_at at time zone 'Asia/Kolkata')::date = ${day}::date or a.check_out_at is null
    order by a.check_in_at desc limit 300`;
  return Response.json({ day, attendance: rows }, { headers: { "Cache-Control": "private, no-store" } });
});
