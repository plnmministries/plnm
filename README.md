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
  `CONTENT_API_URL/api/public/content`. Cached for up to 60 s; Publish refreshes it instantly.
- When someone presses **Publish** in the admin, it calls `POST /api/revalidate` on this site
  (with `REVALIDATE_SECRET`) so changes appear immediately.
- Uploaded images (`/media/...`) are read from the same database.
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

The scheduler `.github/workflows/app-cron.yml` runs every 30 minutes: it adds the channel's new
"Daily Word" video as the day's prayer and sends the notification. It needs the repository secrets
`SITE_URL` and `CRON_SECRET` (GitHub → Settings → Secrets and variables → Actions).

## Deploy (Vercel)

In Vercel: **Add New → Project →** import `plnm` (framework is detected as Next.js), then add these
environment variables and deploy:

- `DATABASE_URL`: the Neon connection string (added automatically if you create the Neon
  database from this Vercel project's *Storage* tab)
- `REVALIDATE_SECRET`: the same value Render generated for the admin app

Note: the site's components (`src/components/site`) also exist in the admin app, which uses them
for its live preview. When changing a section's design, update both repos.
