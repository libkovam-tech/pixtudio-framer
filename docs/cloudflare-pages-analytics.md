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
