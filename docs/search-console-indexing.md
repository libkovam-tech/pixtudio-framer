# Search Console indexing fixes

This note tracks the current Google Search Console coverage warning from
2026-06-14.

## What is expected

The canonical public host is:

```text
https://pixtudio.app/
```

The sitemap intentionally lists only canonical `https://pixtudio.app` URLs.
HTTP URLs are expected to be excluded from indexing because they redirect to
HTTPS.

## Diagnosis before the Cloudflare fix

Verified on 2026-06-14:

```bash
curl -I https://pixtudio.app/
# 200 OK

curl -I http://pixtudio.app/
# 301 Location: https://pixtudio.app/

curl -I http://www.pixtudio.app/
# 301 Location: https://www.pixtudio.app/

curl -I https://www.pixtudio.app/
# 200 OK
```

At that point, the live `www` HTTPS host served duplicate content and relied on the
HTML canonical tag to point back to `https://pixtudio.app/`. That is why Search
Console reports `https://www.pixtudio.app/` as an alternate page with a
canonical tag.

The editor route is an application surface, not an SEO landing page. It should
not be indexed. The React route adds a `noindex, nofollow` meta tag at runtime,
and `public/_headers` adds the same instruction at the HTTP header level for:

```text
/editor
/editor/*
```

## Cloudflare action applied

Cloudflare now has a Bulk Redirect from `www` to the apex domain:

```text
Source URL: https://www.pixtudio.app
Target URL: https://pixtudio.app
Status: 301
Options: preserve query string, subpath matching, preserve path suffix
```

The `www` DNS record must remain proxied through Cloudflare, otherwise the
redirect rule cannot run at the edge.

Verified after the Cloudflare change on 2026-06-14:

```bash
curl -I https://www.pixtudio.app/
# 301 Location: https://pixtudio.app/

curl -I https://www.pixtudio.app/links/
# 301 Location: https://pixtudio.app/links/
```

## Search Console follow-up

After deployment and the Cloudflare redirect change:

1. Use URL Inspection for `https://pixtudio.app/`, `/links/`, and
   `/pixel-art-from-photos/`.
2. Request indexing for canonical content pages if needed.
3. Run Validate Fix for the `Page with redirect` and
   `Alternate page with proper canonical tag` warnings.
4. Treat `http://` URLs as expected exclusions if they redirect to HTTPS.
5. Treat `/editor` as expected exclusion if Search Console reports it as
   `noindex`.
