import "server-only";
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "../db";
import { appReady, type AppUser } from "./schema";

// App login: username + password (scrypt, same scheme as the admin app's accounts.ts). Sessions are a
// signed token "uid.version.expiry.signature" the app stores and sends as Authorization: Bearer.
// Bumping app_users.token_version signs a user out everywhere. Email codes are only for password reset.

const TOKEN_DAYS = 365;

function secret() {
  const s = process.env.APP_JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("APP_JWT_SECRET is not set");
  return "dev-only-app-secret";
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

// last_seen_at is for the admin's "active this month" view, so once a day is plenty: at 5K users
// a per-request write would be the busiest thing the database does.
const SEEN_EVERY_MS = 24 * 60 * 60_000;

/** The signed-in user for a request, or null. Updates last_seen_at at most once a day. */
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
  if (Date.now() - seen > SEEN_EVERY_MS) db()`update app_users set last_seen_at = now() where id = ${user.id}`.catch(() => {});
  return user;
}

/** Best-effort client address (Vercel sets x-forwarded-for itself, so the first entry is the caller). */
export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip")?.trim() || "";
}

// ---- usernames and passwords ----

export const USERNAME_RULE = "Username: 3 to 20 lowercase letters, numbers, dots or underscores";
export const PASSWORD_RULE = "Password must be 8 to 100 characters";

/** Lowercases and validates a username; null when it doesn't fit the rule. */
export function normalizeUsername(v: unknown): string | null {
  const u = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[a-z0-9_.]{3,20}$/.test(u) ? u : null;
}

/** Passwords are taken as typed (no trimming) so sign-up and login always agree. */
export function readPassword(v: unknown): string | null {
  return typeof v === "string" && v.length >= 8 && v.length <= 100 ? v : null;
}

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return { salt, hash };
}

/** Constant-time check. Accounts without a password (never set, or reset pending) never match. */
export async function verifyPassword(password: string, user: Pick<AppUser, "password_hash" | "password_salt"> | null | undefined) {
  // hash against a fixed salt even when there is nothing to compare, so a missing account takes as long as a wrong password
  const salt = user?.password_salt || "no-account";
  const given = await scrypt(password, salt, 64);
  if (!user?.password_hash) return false;
  const stored = Buffer.from(user.password_hash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}

/**
 * Finds a user by email (contains "@"), username, or mobile number. A number is matched on its last 10 digits,
 * so "+91 99490 10301", "09949010301" and "9949010301" are the same phone; a username wins if one is spelled
 * the same, and a number shared by two accounts matches neither.
 */
export async function findUser(identifier: string): Promise<AppUser | null> {
  await appReady();
  const id = identifier.trim().toLowerCase();
  if (!id) return null;
  const sql = db();
  if (id.includes("@")) return ((await sql`select * from app_users where email = ${id}`)[0] as AppUser | undefined) ?? null;
  const byName = (await sql`select * from app_users where username = ${id}`)[0] as AppUser | undefined;
  if (byName) return byName;
  const digits = id.replace(/\D/g, "");
  if (!/^\+?[\d\s()-]+$/.test(id) || digits.length < 10) return null;
  const rows = await sql`select * from app_users where right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${digits.slice(-10)} limit 2`;
  return rows.length === 1 ? (rows[0] as AppUser) : null;
}

// ---- throttles (app_login_attempts) ----

const LOGIN_FAILS = 10; // wrong passwords per username per 15 minutes
const RESET_REQUESTS = 5; // password-reset requests per IP per hour (Resend's free tier is 100 emails a day)

/** True once a username has had 10 wrong passwords in the last 15 minutes. */
export async function loginLocked(username: string) {
  await appReady();
  const rows = await db()`select count(*)::int as n from app_login_attempts where kind = 'login' and username = ${username} and at > now() - interval '15 minutes'`;
  return Number(rows[0].n) >= LOGIN_FAILS;
}

export async function noteFailedLogin(username: string, ip: string) {
  await appReady();
  await db()`insert into app_login_attempts (kind, username, ip) values ('login', ${username}, ${ip})`;
}

/** Forgets wrong-password attempts for an account, whichever identifier they were typed with. */
export async function clearFailedLogins(user: Pick<AppUser, "username" | "email">) {
  await appReady();
  await db()`delete from app_login_attempts where kind = 'login' and (username = ${user.username ?? ""} or username = ${user.email ?? ""})`;
}

/**
 * Counts a password-reset request from this IP and says whether it may go ahead (5 an hour). Counted
 * before the account is looked up, so unknown identifiers cost the same as real ones and can't be enumerated.
 */
export async function allowResetRequest(ip: string) {
  await appReady();
  const sql = db();
  await sql`delete from app_login_attempts where at < now() - interval '1 day'`;
  const rows = await sql`select count(*)::int as n from app_login_attempts where kind = 'reset' and ip = ${ip} and at > now() - interval '1 hour'`;
  if (Number(rows[0].n) >= RESET_REQUESTS) return false;
  await sql`insert into app_login_attempts (kind, ip) values ('reset', ${ip})`;
  return true;
}

// ---- one-time codes for password reset (sent to the account's email) ----

const OTP_MINUTES = 10;
const hashCode = (target: string, code: string) => createHash("sha256").update(`${target}:${code}:${secret()}`).digest("hex");

/**
 * Creates a 6-digit code for the target and remembers who asked. Returns an error instead when one was
 * sent less than a minute ago, or when this IP already got 5 codes in the last hour.
 */
export async function createOtp(target: string, ip: string): Promise<{ code: string } | { error: "recent" | "ip-limit" }> {
  await appReady();
  const sql = db();
  const byIp = await sql`select count(*)::int as n from app_otps where ip = ${ip} and created_at > now() - interval '1 hour'`;
  if (Number(byIp[0].n) >= RESET_REQUESTS) return { error: "ip-limit" };
  const recent = await sql`select created_at from app_otps where target = ${target} and created_at > now() - interval '60 seconds' limit 1`;
  if (recent.length) return { error: "recent" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // rows live an hour so the per-IP count above sees them; verifyOtp only ever reads the newest code per target
  await sql`delete from app_otps where created_at < now() - interval '1 hour'`;
  await sql`insert into app_otps (target, code_hash, ip, expires_at) values (${target}, ${hashCode(target, code)}, ${ip}, now() + ${`${OTP_MINUTES} minutes`}::interval)`;
  return { code };
}

/** Checks the newest code for the target; each wrong try counts, 5 tries burn the code. Success consumes it. */
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
  // consumed: expire every code for this target (rows stay for the per-IP hourly count)
  await sql`update app_otps set expires_at = now() - interval '1 second', attempts = 5 where target = ${target}`;
  return "ok";
}
