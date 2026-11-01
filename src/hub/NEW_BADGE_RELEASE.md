# Temporary NEW markers

The desktop `PLUGINS` marker and mobile `EDITOR` dot share one publication window.

The production build reads `VITE_NEW_BADGE_PUBLISHED_ON` from `.env.production`. Its date must match the actual publication date in Israel (`YYYY-MM-DD`); if publication is postponed, update it before committing and pushing. A Cloudflare Pages Production environment variable with the same name overrides this file, so remove or update any such override before the build. Without a valid date, the markers stay hidden.

The markers appear on that date and disappear at the start of the same date two calendar months later, using the `Asia/Jerusalem` calendar. If the target month has fewer days, the window ends on its last day. The browser updates an open page at the next local midnight or when the tab becomes active again. This is client-side visibility; the SVG and code remain in the deployed bundle until a later code cleanup.

Example: a publication date of `2026-10-31` shows the markers through December 30 and hides them at 00:00 on December 31, Israel time.
