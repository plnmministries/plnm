import { db } from "@/lib/db";
import { appReady } from "@/lib/app/schema";
import { indiaToday } from "@/lib/app/admin";
import { handler, requireUser } from "@/lib/app/http";

// Numbers for the app's Admin panel.
export const GET = handler(async (req) => {
  await requireUser(req, ["admin"]);
  await appReady();
  const sql = db();
  const today = indiaToday();
  const [c] = await sql`
    select (select count(*)::int from app_users where role = 'member') as members,
           (select count(*)::int from app_users where role = 'volunteer') as volunteers,
           (select count(*)::int from app_users where role = 'admin') as admins,
           (select count(*)::int from app_volunteer_requests where status = 'pending') as volunteer_requests,
           (select count(*)::int from app_prayer_requests where status = 'new') as prayer_requests,
           (select count(*)::int from app_attendance where check_out_at is null) as checked_in_now,
           (select count(*)::int from app_attendance where (check_in_at at time zone 'Asia/Kolkata')::date = ${today}::date) as checkins_today,
           (select count(*)::int from app_push_tokens) as devices`;
  const prayer = await sql`select id, title, video_id, notified_at from app_daily_prayers where for_date = ${today}::date and not hidden order by id desc limit 1`;
  return Response.json({ ...c, today, todayPrayer: prayer[0] ?? null }, { headers: { "Cache-Control": "private, no-store" } });
});
