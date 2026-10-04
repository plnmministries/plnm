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

## Deploy (Vercel)

In Vercel: **Add New → Project →** import `plnm` (framework is detected as Next.js), then add these
environment variables and deploy:

- `DATABASE_URL`: the Neon connection string (added automatically if you create the Neon
  database from this Vercel project's *Storage* tab)
- `REVALIDATE_SECRET`: the same value Render generated for the admin app

Note: the site's components (`src/components/site`) also exist in the admin app, which uses them
for its live preview. When changing a section's design, update both repos.
