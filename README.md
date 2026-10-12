# Paralokanestham Ministries — public website (plnm)

The website visitors see. Content is edited in the separate admin app
([plnmadmin](https://github.com/plnmministries/plnmadmin)) and read from it at runtime.

## Run locally

```bash
npm install
cp .env.example .env.local   # set CONTENT_API_URL to the admin app, e.g. http://localhost:3100
npm run dev
```

## How it connects to the admin

- Pages read the **published** content straight from the shared Neon database (`DATABASE_URL`),
  so a sleeping admin server never slows the site down. Without `DATABASE_URL` it falls back to
  `CONTENT_API_URL/api/public/content`. Cached for up to an hour; Publish refreshes it instantly.
- When someone presses **Publish** in the admin, it calls `POST /api/revalidate` on this site
  (with `REVALIDATE_SECRET`) so changes appear immediately.
- Uploaded images (`/media/...`) come from Cloudflare R2 (see below); older ones are still read from the database.
- If the admin is briefly unreachable, the last good copy keeps being served.

## Features

English / Telugu / Hindi (globe button, remembered per visitor), sermons that play on the site with
live-stream detection, events, UPI giving (PhonePe / Google Pay / Paytm + QR) and Get Connected
forms that open WhatsApp with the answers filled in.

## Mobile app API

This project also serves the Paralokanestham mobile app ([plnmapp](https://github.com/plnmministries/plnmapp))
under `/api/app/*`: username + password login, profiles, push tokens, daily prayers, updates, prayer
requests, volunteer replies and attendance. Data lives in the same Neon database (tables `app_*`); the
admin app manages it. Settings: `APP_JWT_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`
(see `.env.example`).

### App login

Members sign up in the app with a username (3–20 lowercase letters, digits, dots or underscores), a
password (8+ characters) and their name; email and phone are optional. The first account ever created
is the admin. Passwords are stored as salted scrypt hashes; the app keeps a signed bearer token that
`POST /api/app/auth/logout-all` (or a password reset) invalidates everywhere. Accounts can be deleted
in-app with `POST /api/app/auth/delete-account` (Apple and Google require this).

Email is used for one thing: **Forgot password** (`/api/app/auth/forgot` → `/api/app/auth/reset`)
emails a 6-digit code through [Resend](https://resend.com) when the account has an address. Limits:
5 reset requests per IP per hour, 10 wrong passwords per username per 15 minutes. Without
`RESEND_API_KEY` the code is logged to the server console (and returned in the response outside
production), which is how to test locally.

To send from `no-reply@paralokanestham.in`, verify the domain once in Resend:

1. Resend → **Domains → Add domain** → `paralokanestham.in` (region: pick the one nearest your users).
2. Add the DNS records Resend lists at the domain's DNS host (where the site's own records live):
   a TXT record at `resend._domainkey` (DKIM), an MX and a TXT record for the `send` subdomain (SPF
   for bounces), and optionally a DMARC TXT record at `_dmarc`.
3. Back in Resend press **Verify**; it usually turns green within minutes (DNS can take up to a day).
4. Resend → **API Keys → Create** (sending access only) and set `RESEND_API_KEY` plus
   `MAIL_FROM="Paralokanestham Ministries <no-reply@paralokanestham.in>"` in Vercel.

Until the domain is verified, Resend only delivers to the address that owns the Resend account.

### Feeds and caching

The app's read-only feeds never read the database per request. `GET /api/app/daily` (latest 30 daily
prayers), `GET /api/app/updates` (latest 50, 20 a page), `GET /api/app/home` (today's prayer, latest
updates, live status, next event) and `GET /api/app/prayers` come from Next's data cache
(`src/lib/app/feeds.ts`, tags `app-daily` and `app-updates`): one database read per feed per hour at
most, shared by every phone. They answer with `Cache-Control: public, max-age=60, s-maxage=300,
stale-while-revalidate=600`, so Vercel's CDN serves signed-out requests without running any code
(requests that carry a sign-in token always reach the function and get the cached copy). A signed-in
`/api/app/home` adds the member's own counters and is marked `private`.

The scheduler expires `app-daily` the moment it adds or announces a prayer. After the **admin** adds,
hides or deletes a daily prayer or an update it should call `POST /api/revalidate?tag=app-daily`
or `?tag=app-updates` (header `x-revalidate-secret`, the same call Publish makes); otherwise phones
see the change within the hour.

### Scheduler

`POST /api/app/cron` (GET works too) with the header `x-cron-secret: <CRON_SECRET>` adds the channel's
new "Daily Word" video as the day's prayer and sends the notification, answering
`{ added, notified }`. Without the right header it returns 401. A tick that finds nothing new on
YouTube never opens the database, so frequent ticks are free. `YOUTUBE_CHANNEL_ID` names the channel
(it falls back to the published site settings).

Run it from a **Cloudflare Worker** (free plan): `scripts/cron-worker.js` is the whole Worker and its
header comment has the click-by-click setup. It needs the Worker variable `SITE_URL`, the Worker
secret `CRON_SECRET` and two cron triggers (Cloudflare crons are in UTC):

| Trigger | When |
| --- | --- |
| `*/10 23,0-5 * * *` | every 10 minutes from 04:30 to 11:20 IST, the morning window |
| `0 6-22 * * *` | once an hour the rest of the day |

Alternative without Cloudflare: [cron-job.org](https://cron-job.org) (free). Create two cronjobs with
URL `https://www.paralokanestham.in/api/app/cron`, request method **POST**, a custom header
`x-cron-secret` set to the secret, time zone **Asia/Kolkata**, and the schedules
`*/10 5-10 * * *` (morning window) and `0 0-4,11-23 * * *` (hourly otherwise).

## Staying on Neon free

The free plan gives 0.5 GB of storage, 100 compute-hours a month and 5 GB of egress, and suspends the
compute for the rest of the month once the hours are used up. Compute-hours are compute size × time
awake, so at 0.25 CU the database may be awake about 400 hours a month, roughly 13 a day. Three
settings in the Neon dashboard keep that budget safe:

1. **Project → Branches → main → Compute → Edit**: autoscaling **min 0.25 CU, max 0.25 CU**. A larger
   max spends the budget faster when the morning traffic arrives; it does not make the plan cheaper.
2. Same dialog: **Scale to zero after 5 minutes** of inactivity (the default). Keep it on, this is what
   lets the database sleep between the morning prayer, updates and the hourly scheduler tick.
3. **Billing → Usage**: turn on the usage notification and set it at **70 percent** of compute hours
   (pick the nearest threshold the dialog offers), so there is time to act before a suspension.

What this code does to stay inside it: feeds and site content are cached for an hour and expired on
demand, Vercel's CDN answers signed-out feed requests, a member's `last_seen_at` is written once a day
instead of once a minute, pushes go out in parallel so the function finishes fast, and a scheduler tick
with nothing new never connects at all. Check **Monitoring → Compute hours** once a week in the first
month; if usage runs ahead of 70 percent by the third week, switch before the cap hits:

- **Neon Launch** ($19 a month): 300 compute-hours and 10 GB, same connection string, nothing to change.
- **Supabase free Postgres**: no compute-hour cap and no autoscaling (a fixed small instance), 500 MB,
  but the project pauses after a week without traffic. Create a project, copy the pooled connection
  string (transaction mode, which `prepare: false` in `src/lib/db.ts` already supports), set it as
  `DATABASE_URL` on Vercel and Render, and the tables are created on first use.

## Cloudflare R2 (uploaded files)

Every uploaded file lives in Cloudflare R2 (S3-compatible object storage, 10 GB free), not in the 0.5 GB Neon
database: profile pictures (`avatars/{userId}/{version}.jpg`), website and update images (`media/{name}`) and
the volunteers' check-in selfies (`attendance/{YYYY-MM-DD}/{id}.jpg`). Phones upload straight to R2 with
presigned URLs from `/api/app/uploads/*` (Vercel caps request bodies at 4.5 MB), so the API only signs URLs
(`src/lib/app/storage.ts`). Selfies are deleted after 15 days; the attendance rows are kept forever.

One-time setup in the Cloudflare dashboard (labels as of October 2026; the `paralokanestham.in` zone must be
on Cloudflare for step 3):

1. **Buckets:** *R2 Object Storage → Create bucket* → name `plnm`, location hint *Asia-Pacific (APAC)*, default
   storage class *Standard*. Create a second bucket `plnm-private` the same way: it holds the selfies and never
   gets public access (a custom domain makes a whole bucket public, so selfies can't share the first one).
2. **API token:** *R2 Object Storage → API → Manage API tokens → Create User API token* → name `plnm-apps`,
   permission **Object Read & Write**, *Specify bucket(s):* `plnm` and `plnm-private`, TTL *Forever* → *Create API
   Token*. Copy the **Access Key ID** and **Secret Access Key** (shown only once) into `R2_ACCESS_KEY_ID` and
   `R2_SECRET_ACCESS_KEY`. The same page shows the S3 endpoint `https://<account id>.r2.cloudflarestorage.com`;
   that 32-character account id is `R2_ACCOUNT_ID`.
3. **Custom domain:** bucket `plnm` → *Settings → Public access → Custom Domains → Connect Domain* →
   `media.paralokanestham.in` → *Continue* (Cloudflare adds the DNS record itself; wait for status *Active*).
   `R2_PUBLIC_URL=https://media.paralokanestham.in`. Leave *r2.dev subdomain* off on both buckets and never
   connect a domain to `plnm-private`.
4. **Lifecycle rule (15-day selfies):** bucket `plnm-private` → *Settings → Object lifecycle rules → Add rule* →
   name `delete-selfies-after-15-days`, prefix `attendance/`, tick **Delete uploaded objects** → *15 days after
   upload* → *Add rule*. (Optionally add *Abort incomplete multipart uploads after 1 day* too.)
5. **Variables:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=plnm`,
   `R2_PRIVATE_BUCKET=plnm-private`, `R2_PUBLIC_URL` in Vercel (this site) and in Render (the admin app, which
   uploads the website images), then redeploy both.
6. **Existing website images:** in the admin repo run `npm run migrate-media` once. It copies every `plnm_media`
   row to `media/{name}` in R2 and prints what it did; the rows are kept, so old `/media/…` links keep working
   (the site redirects to R2 for anything not in the database).

No CORS rule is needed: the phone app isn't a browser and the admin uploads through its own server.
Without the `R2_*` variables everything works as before (images in the database); the upload routes answer 503.

## Deploy (Vercel)

In Vercel: **Add New → Project →** import `plnm` (framework is detected as Next.js), then add these
environment variables and deploy:

- `DATABASE_URL`: the Neon connection string (added automatically if you create the Neon
  database from this Vercel project's *Storage* tab)
- `REVALIDATE_SECRET`: the same value Render generated for the admin app
- the `R2_*` variables from the Cloudflare R2 section above
- `CRON_SECRET` and `YOUTUBE_CHANNEL_ID` for the scheduler (see **Scheduler** above)

Note: the site's components (`src/components/site`) also exist in the admin app, which uses them
for its live preview. When changing a section's design, update both repos.
