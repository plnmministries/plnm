import "server-only";
import { db } from "../db";
import { notify } from "./push";

/** Today's date in India (the church's day), YYYY-MM-DD. */
export const indiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Pushes a message to every admin (there are only a few), e.g. when someone asks to volunteer. */
export async function notifyAdmins(title: string, body: string) {
  const admins = await db()`select id from app_users where role = 'admin' and not blocked`;
  await Promise.all(admins.map((a) => notify(`user:${Number(a.id)}`, title, body, { kind: "custom" }).catch(() => 0)));
}
