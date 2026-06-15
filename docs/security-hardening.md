# PIXTUDIO security hardening notes

Last updated: 2026-06-15

## Implemented in the repository

- `public/_headers` defines Cloudflare Pages security headers for all routes.
- `public/_headers` keeps `X-Robots-Tag: noindex, nofollow` on `/editor`.
- `public/robots.txt` disallows `/editor` and points to the canonical sitemap.
- `src/editor/fileIntakeSecurity.ts` defines the file intake limits and user-facing
  rejection messages.
- The main Open File flow routes files through the project/image/unsupported gate
  before handing them to restore or image import logic.
- Raster image import rejects SVG and unknown image MIME types.
- Project files are size-checked before reading text.
- Raster images are file-size checked before decode and dimension-checked after
  `createImageBitmap`.

## Current file intake limits

- `MAX_PROJECT_SAVE_BYTES`: 8 MiB
- `MAX_IMAGE_BYTES`: 32 MiB
- `MAX_IMAGE_WIDTH`: 8192 px
- `MAX_IMAGE_HEIGHT`: 8192 px
- `MAX_IMAGE_PIXELS`: 33,000,000 px

## Manual Cloudflare checks

- Keep the production `www` redirect proxied through Cloudflare.
- If Cloudflare Web Analytics is enabled from the dashboard, do not add its token
  to the repository. The CSP allows the Cloudflare beacon host.
- If another analytics layer is enabled, confirm that it does not double-count
  with Cloudflare Web Analytics.
- Protect public Cloudflare Pages preview URLs with Cloudflare Access when preview
  deployments can contain drafts, experiments, or non-public functionality.

## Verification checklist

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run e2e`
- `npm audit --audit-level=moderate`
- Confirm `dist/_headers` exists after build.
- Confirm `dist/robots.txt` includes `/editor` disallow rules after build.
