import "server-only";
import { createHash, randomInt } from "crypto";
import { db } from "../db";
import { appReady, type AppUser } from "./schema";

// App sessions: a signed token "uid.version.expiry.signature" the app stores and sends as
// Authorization: Bearer. Bumping app_users.token_version signs a user out everywhere.

const TOKEN_DAYS = 365;

function secret() {
  const s = process.env.APP_JWT_SECRET || process.env.REVALIDATE_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("APP_JWT_SECRET is not set");
  return s || "dev-only-app-secret";
}

async function hmac(data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, enc.encode(data))).toString("base64url");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueToken(user: AppUser) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400;
  const body = `${user.id}.${user.token_version}.${exp}`;
  return `${body}.${await hmac(body)}`;
}

/** The signed-in user for a request, or null. Updates last_seen_at at most once a minute. */
export async function userFromRequest(req: Request): Promise<AppUser | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [uid, version, exp, sig] = parts;
  if (!/^\d+$/.test(uid) || Number(exp) < Date.now() / 1000) return null;
  if (!safeEqual(await hmac(`${uid}.${version}.${exp}`), sig)) return null;
  await appReady();
  const rows = await db()`select * from app_users where id = ${Number(uid)}`;
  const user = rows[0] as AppUser | undefined;
  if (!user || user.blocked || String(user.token_version) !== version) return null;
  const seen = user.last_seen_at ? new Date(user.last_seen_at).getTime() : 0;
  if (Date.now() - seen > 60_000) db()`update app_users set last_seen_at = now() where id = ${user.id}`.catch(() => {});
  return user;
}

// ---- one-time codes (email now; the same table serves phone OTP later) ----

const OTP_MINUTES = 10;
const hashCode = (target: string, code: string) => createHash("sha256").update(`${target}:${code}:${secret()}`).digest("hex");

/** Creates a 6-digit code for the target. Returns null if one was sent less than a minute ago. */
export async function createOtp(target: string): Promise<string | null> {
  await appReady();
  const sql = db();
  const recent = await sql`select created_at from app_otps where target = ${target} and created_at > now() - interval '60 seconds' limit 1`;
  if (recent.length) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await sql`delete from app_otps where target = ${target} or expires_at < now()`;
  await sql`insert into app_otps (target, code_hash, expires_at) values (${target}, ${hashCode(target, code)}, now() + ${`${OTP_MINUTES} minutes`}::interval)`;
  return code;
}

/** Checks a code; each wrong try counts, 5 tries burn the code. */
export async function verifyOtp(target: string, code: string): Promise<"ok" | "wrong" | "expired"> {
  await appReady();
  const sql = db();
  const rows = await sql`select id, code_hash, attempts, expires_at from app_otps where target = ${target} order by created_at desc limit 1`;
  const otp = rows[0];
  if (!otp || new Date(otp.expires_at as string).getTime() < Date.now() || Number(otp.attempts) >= 5) return "expired";
  if (!safeEqual(otp.code_hash as string, hashCode(target, code.trim()))) {
    await sql`update app_otps set attempts = attempts + 1 where id = ${otp.id as number}`;
    return "wrong";
  }
  await sql`delete from app_otps where target = ${target}`;
  return "ok";
}

export async function findOrCreateUserByEmail(email: string): Promise<AppUser> {
  await appReady();
  const sql = db();
  const found = await sql`select * from app_users where email = ${email}`;
  if (found.length) return found[0] as AppUser;
  // the first account ever created becomes the admin, so the client can manage the app from day one
  const count = await sql`select count(*)::int as n from app_users`;
  const role = Number(count[0].n) === 0 ? "admin" : "member";
  const rows = await sql`insert into app_users (email, role) values (${email}, ${role}) returning *`;
  return rows[0] as AppUser;
}
