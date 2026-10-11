// Cloudflare Worker that ticks the site's scheduler: POST /api/app/cron with the shared secret.
// The endpoint syncs new "Daily Word" videos from YouTube and sends the morning notification;
// a tick with nothing new never opens the database, so frequent ticks cost nothing on Neon.
//
// Setup (once, free plan is plenty: 100k requests a day):
//   1. Cloudflare dashboard → Workers & Pages → Create → Start with Hello World → name it `plnm-cron`
//      → Deploy, then Edit code: replace everything with this file and Deploy again.
//   2. Worker → Settings → Variables and Secrets:
//        SITE_URL     (text)    https://www.paralokanestham.in
//        CRON_SECRET  (secret)  the same value as CRON_SECRET on the Vercel project
//   3. Worker → Settings → Triggers → Cron Triggers → add these two schedules.
//      Cloudflare crons run in UTC; IST is UTC+5:30, so 05:00–11:00 IST is 23:30–05:30 UTC.
//
//        */10 23,0-5 * * *    every 10 minutes from 04:30 to 11:20 IST (the morning window:
//                             the Daily Word usually arrives then and the prayer opens at once)
//        0 6-22 * * *         once an hour the rest of the day (11:30 IST to 03:30 IST next day)
//
//      Or with wrangler instead of the dashboard, put the same schedules in wrangler.toml:
//        name = "plnm-cron"
//        main = "scripts/cron-worker.js"
//        compatibility_date = "2026-01-01"
//        [triggers]
//        crons = ["*/10 23,0-5 * * *", "0 6-22 * * *"]
//      then `npx wrangler secret put CRON_SECRET`, add SITE_URL under [vars], and `npx wrangler deploy`.
//
//   To test without waiting: Worker → Settings → Triggers → Cron Triggers → "Run now" (or
//   `npx wrangler dev --test-scheduled` and open /__scheduled). Logs show each tick's result.

const worker = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env, event.cron));
  },

  // The Worker has no public job: visiting its URL must not trigger a tick (anyone could then
  // hammer the site). Secrets never leave the Worker.
  async fetch() {
    return new Response("plnm-cron runs on a schedule.", { status: 404 });
  },
};

export default worker;

async function tick(env, cron) {
  if (!env.SITE_URL || !env.CRON_SECRET) throw new Error("Set the SITE_URL variable and the CRON_SECRET secret on this Worker");
  const url = `${env.SITE_URL.replace(/\/$/, "")}/api/app/cron`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-cron-secret": env.CRON_SECRET, "User-Agent": "plnm-cron" },
    signal: AbortSignal.timeout(60_000), // the site may be syncing YouTube and sending pushes
  });
  const body = await res.text();
  console.log(`[${cron}] ${res.status} ${body}`);
  if (!res.ok) throw new Error(`cron tick failed: ${res.status} ${body}`); // shows as a failed invocation in the dashboard
}
