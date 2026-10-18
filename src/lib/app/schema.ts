import "server-only";
import { db, ready } from "../db";
import { avatarUrl } from "./storage";

// Tables for the mobile app (users + login throttles, daily prayers, updates, prayer requests, volunteer attendance).
// Created on first use, idempotent. Shared with the admin app, which manages the same tables.

const g = globalThis as { __plnmAppSchema?: Promise<void> };

export function appReady(): Promise<void> {
  g.__plnmAppSchema ??= (async () => {
    await ready();
    const sql = db();
    await sql`create table if not exists app_users (
      id bigserial primary key,
      username text unique,                          -- lowercase, 3-20 of a-z 0-9 _ .
      password_hash text,                            -- scrypt, hex (see auth.ts)
      password_salt text,
      email text unique,                             -- optional, only for password reset
      phone text unique,
      name text not null default '',
      photo text,
      role text not null default 'member',          -- member | volunteer | admin
      lang text not null default 'en',
      blocked boolean not null default false,
      token_version integer not null default 0,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz
    )`;
    // databases created before username/password login
    await sql`alter table app_users add column if not exists username text unique`;
    await sql`alter table app_users add column if not exists password_hash text`;
    await sql`alter table app_users add column if not exists password_salt text`;
    await sql`create table if not exists app_otps (
      id bigserial primary key,
      target text not null,                          -- the email the reset code went to
      code_hash text not null,
      attempts integer not null default 0,
      ip text not null default '',                   -- who asked for it (5 codes per IP per hour)
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )`;
    await sql`alter table app_otps add column if not exists ip text not null default ''`;
    await sql`create index if not exists app_otps_target on app_otps (target, created_at desc)`;
    await sql`create index if not exists app_otps_ip on app_otps (ip, created_at desc)`;
    await sql`create table if not exists app_login_attempts (
      id bigserial primary key,
      kind text not null default 'login',            -- login (wrong password) | reset (code requested)
      username text not null default '',             -- the identifier typed, lowercased
      ip text not null default '',
      at timestamptz not null default now()
    )`;
    await sql`create index if not exists app_login_attempts_user on app_login_attempts (kind, username, at desc)`;
    await sql`create index if not exists app_login_attempts_ip on app_login_attempts (kind, ip, at desc)`;
    await sql`create table if not exists app_push_tokens (
      token text primary key,
      user_id bigint not null references app_users(id) on delete cascade,
      platform text not null default '',
      updated_at timestamptz not null default now()
    )`;
    await sql`create table if not exists app_daily_prayers (
      id bigserial primary key,
      video_id text not null unique,
      title text not null,
      for_date date not null,
      published_at timestamptz not null default now(),
      source text not null default 'auto',           -- auto (YouTube sync) | manual
      notified_at timestamptz,
      hidden boolean not null default false,
      created_at timestamptz not null default now()
    )`;
    await sql`create table if not exists app_prayer_replies (
      id bigserial primary key,
      prayer_id bigint not null references app_daily_prayers(id) on delete cascade,
      user_id bigint not null references app_users(id) on delete cascade,
      text text not null,
      created_at timestamptz not null default now()
    )`;
    await sql`create index if not exists app_prayer_replies_prayer on app_prayer_replies (prayer_id, created_at)`;
    await sql`create table if not exists app_updates (
      id bigserial primary key,
      title text not null,
      body text not null default '',
      image text,                                    -- /media/... or full URL
      link text,
      published_at timestamptz not null default now(),
      notified_at timestamptz,
      hidden boolean not null default false,
      created_at timestamptz not null default now()
    )`;
    await sql`create table if not exists app_prayer_requests (
      id bigserial primary key,
      user_id bigint not null references app_users(id) on delete cascade,
      text text not null,
      status text not null default 'new',            -- new | praying | answered
      reply text,
      replied_by bigint references app_users(id),
      replied_at timestamptz,
      reply_seen boolean not null default false,
      created_at timestamptz not null default now()
    )`;
    await sql`create index if not exists app_prayer_requests_user on app_prayer_requests (user_id, created_at desc)`;
    await sql`create table if not exists app_volunteer_requests (
      id bigserial primary key,
      user_id bigint not null references app_users(id) on delete cascade,
      note text not null default '',
      status text not null default 'pending',        -- pending | approved | declined
      decided_by bigint references app_users(id) on delete set null,
      decided_at timestamptz,
      created_at timestamptz not null default now()
    )`;
    await sql`create index if not exists app_volunteer_requests_status on app_volunteer_requests (status, created_at desc)`;
    await sql`create unique index if not exists app_volunteer_requests_one_pending on app_volunteer_requests (user_id) where status = 'pending'`;
    await sql`create table if not exists app_verses (
      id bigserial primary key,
      text text not null,                            -- as typed or pasted by the admin (often Telugu)
      reference text not null default '',
      created_by bigint references app_users(id) on delete set null,
      created_at timestamptz not null default now()
    )`;
    await sql`create table if not exists app_attendance (
      id bigserial primary key,
      user_id bigint not null references app_users(id) on delete cascade,
      check_in_at timestamptz not null default now(),
      check_out_at timestamptz,
      lat double precision,
      lng double precision,
      accuracy double precision,
      biometric boolean not null default false,
      selfie_key text,                               -- R2 key attendance/YYYY-MM-DD/{id}.jpg; the object is deleted after 15 days
      device text not null default '',
      note text not null default ''
    )`;
    // tables created before selfies moved to R2 (the bytea column never held real data)
    await sql`alter table app_attendance add column if not exists selfie_key text`;
    await sql`alter table app_attendance drop column if exists selfie`;
    await sql`create index if not exists app_attendance_user on app_attendance (user_id, check_in_at desc)`;
    await sql`create table if not exists app_notifications (
      id bigserial primary key,
      kind text not null,                            -- daily | update | prayer-reply | custom
      ref_id bigint,
      title text not null,
      body text not null default '',
      audience text not null default 'all',          -- all | volunteers | user:<id>
      sent_count integer not null default 0,
      sent_at timestamptz not null default now()
    )`;
  })().catch((e) => {
    g.__plnmAppSchema = undefined; // retry next time
    throw e;
  });
  return g.__plnmAppSchema;
}

export type AppUser = {
  id: number;
  username: string | null;
  password_hash: string | null;
  password_salt: string | null;
  email: string | null;
  phone: string | null;
  name: string;
  photo: string | null;
  role: "member" | "volunteer" | "admin";
  lang: string;
  blocked: boolean;
  token_version: number;
  created_at: Date;
  last_seen_at: Date | null;
};

/** The fields the app may see about a user. `photo` is stored as an R2 key and returned as a URL. */
export function publicUser(u: AppUser) {
  return { id: Number(u.id), username: u.username, email: u.email, phone: u.phone, name: u.name, photo: avatarUrl(u.photo), role: u.role, lang: u.lang, createdAt: u.created_at };
}
