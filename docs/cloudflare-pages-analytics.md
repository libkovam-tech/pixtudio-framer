# Cloudflare Pages analytics setup

This project expects Cloudflare-specific settings to be configured in the
Cloudflare dashboard where possible.

There are two analytics layers:

1. Cloudflare Web Analytics for page views, visitors, Web Vitals, and page load
   metrics.
2. A small custom Pages Function endpoint for product events such as
   `import_image` and `export_image`.

## Project settings in Cloudflare Pages

Use these settings for the Pages project:

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: repository root
- Environment variables: none required for Cloudflare Web Analytics

Do not add the Cloudflare Web Analytics token to the repository. If Web
Analytics is enabled from the Pages dashboard, Cloudflare injects its beacon on
deployment.

## Enable Cloudflare Web Analytics

1. Open the Cloudflare dashboard.
2. Go to Workers & Pages.
3. Open the Pages project for this repository.
4. Open Metrics.
5. Under Web Analytics, choose Enable.
6. Trigger a new deployment after enabling it.
7. After deployment, visit the live site in a normal browser tab.
8. Return to Web Analytics in Cloudflare and wait for data to appear.

If the dashboard does not show data immediately, wait a few minutes and make
sure the live HTML contains Cloudflare's beacon script from
`static.cloudflareinsights.com`.

## Enable custom D1 event analytics

The app sends custom events to `/api/analytics`. Cloudflare Pages maps this to
`functions/api/analytics.ts`.

Create a D1 database in Cloudflare:

1. Open Workers & Pages.
2. Go to D1 SQL Database.
3. Create a database for analytics events.
4. Open the database console.
5. Run `sql/analytics_schema.sql`.

Bind the D1 database to the Pages project:

1. Open the Pages project.
2. Go to Settings.
3. Open Functions.
4. Add a D1 database binding.
5. Binding name: `ANALYTICS_DB`
6. Select the D1 database created above.
7. Save.
8. Redeploy the Pages project.

The custom endpoint is intentionally best-effort from the browser: failed
requests are ignored so analytics cannot break editing or exporting.
It also records `batch_pixelation_download_click` when the user presses DOWNLOAD
in the Batch Pixelation archive confirmation dialog.

## GitHub push and deployment flow

From the repository root:

```bash
git status
git add src/editor/analytics.ts docs/cloudflare-pages-analytics.md
git commit -m "Prepare Cloudflare Pages analytics"
git push origin main
```

If the default branch is not `main`, replace `main` with the current branch
name from:

```bash
git branch --show-current
```

Cloudflare Pages should start a deployment automatically after the push if the
GitHub repository is connected to the Pages project.

## Quick verification

After deployment:

1. Open `https://YOUR_DOMAIN/api/ping` and confirm it returns `ok`.
2. Open the app and import or export an image.
3. In Cloudflare, check that the Pages Function has no binding errors.
4. Query the D1 table `analytics_events` and confirm rows are being inserted.
5. Open Cloudflare Web Analytics and confirm page view data appears.

## Email analytics reports

The separate `pixtudio-analytics-reporter` Worker reads D1 and sends the
previous completed month by email from its monthly Cron Trigger. There is no
browser action, report code, or HTTP endpoint for requesting a report.

The browser never receives the report data. The email contains only:

- action
- date
- country

The monthly report counts Batch Pixelation DOWNLOAD clicks separately from
image imports and exports. Reports with more than 200 events are sent as
sequential, numbered emails
(`1/N`, `2/N`, etc.). Every part repeats the full-month import/export/download-click totals
and top 10 countries; its event table contains only that part's rows. The
plain-text version follows the same structure. Confirm all numbered parts
arrived before treating a monthly report as complete. If sending fails after
some parts, the provider cannot roll back emails already accepted; inspect
Worker email logs before deciding whether to rerun; a rerun can duplicate
parts already delivered.
The reporter does not generate a PDF: printing from a clipped mail-client view
may omit later rows even when the original email was delivered in full.

Sensitive fields such as IP, user agent, URL, Ray ID, and colo are not included.

### Deploy the reporter Worker

Copy the example config:

```bash
copy wrangler.analytics-reporter.example.toml wrangler.analytics-reporter.toml
```

Edit `wrangler.analytics-reporter.toml`:

- replace `REPLACE_WITH_D1_DATABASE_ID`
- replace `REPLACE_WITH_YOUR_EMAIL`
- keep `ANALYTICS_REPORT_SENDER` as `analytics@pixtudio.app`
- keep `allowed_sender_addresses` as `["analytics@pixtudio.app"]`

Deploy:

```bash
npx wrangler deploy -c wrangler.analytics-reporter.toml
```

### Cloudflare bindings

For the reporter Worker:

- D1 binding: `ANALYTICS_DB`
- Send Email binding: `REPORT_EMAIL`
- allowed sender address: `analytics@pixtudio.app`
- var: `ANALYTICS_REPORT_SENDER=analytics@pixtudio.app`
- var: `ANALYTICS_REPORT_RECIPIENT=your email`

The monthly report is handled by the Worker cron in `wrangler.analytics-reporter.toml`.
Deploying the Pages site does not deploy this separate Worker. Remove the old
`ANALYTICS_REPORTER` service binding from the Pages project and the old
`ANALYTICS_REPORT_SECRET_HASH` Worker secret after deploying this removal.
The obsolete `analytics_report_rate_limits` D1 table is not used; existing
data is left intact rather than dropped by this change.

### One-time catch-up report

Only for the requested catch-up after this release, an authorized operator may
invoke the same scheduled handler once. Do not use `wrangler dev --remote`:
its preview route can dispatch to `fetch` instead of `scheduled` when this
Worker exports only the scheduled handler.

In the ignored local `wrangler.analytics-reporter.toml`, temporarily add
`remote = true` to both the `[[d1_databases]]` and `[[send_email]]` binding
blocks. Keep the checked-in example config unchanged. This connects local
Worker execution to the real D1 and Send Email resources. Then start Wrangler:

```powershell
npx wrangler dev -c .\wrangler.analytics-reporter.toml --test-scheduled --ip 127.0.0.1 --port 8787
```

After Wrangler reports readiness, run this in a second PowerShell window **once**:

```powershell
Invoke-WebRequest 'http://127.0.0.1:8787/cdn-cgi/local/scheduled?format=json'
```

Stop Wrangler with Ctrl+C afterward and remove the temporary `remote = true`
lines from the ignored local config. This sends real messages but does not
deploy the development Worker to production. Before invoking, check whether
the monthly Cron already sent a complete report for the same month; do not
run it if all parts have already arrived. Check the scheduled-handler outcome
and count all numbered emails. If the send fails mid-series, inspect Worker
logs and received parts
before any retry because previously accepted emails cannot be rolled back.

Cloudflare cron schedules use UTC. The example runs on the first day of each
month at 06:00 UTC and sends the previous calendar month.
