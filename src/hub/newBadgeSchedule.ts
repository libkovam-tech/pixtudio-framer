const SITE_TIME_ZONE = "Asia/Jerusalem"
const SITE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: SITE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function localCalendarDay(instant: Date): number {
  const localParts = SITE_DATE_FORMATTER.formatToParts(instant)
  const localDate = Object.fromEntries(localParts.map(({ type, value }) => [type, Number(value)]))
  return Date.UTC(localDate.year, localDate.month - 1, localDate.day)
}

export function millisecondsUntilNextSiteDay(now = new Date()): number {
  const today = localCalendarDay(now)
  let lower = now.getTime()
  let upper = lower + 36 * 60 * 60 * 1000

  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2)
    if (localCalendarDay(new Date(middle)) > today) upper = middle
    else lower = middle
  }

  return upper - now.getTime()
}

/** The badge is visible from the publication date until the same local date two months later. */
export function isNewBadgeVisible(publishedOn: string | undefined, now = new Date()): boolean {
  if (!publishedOn || !/^\d{4}-\d{2}-\d{2}$/.test(publishedOn)) return false

  const [year, month, day] = publishedOn.split("-").map(Number)
  const publication = Date.UTC(year, month - 1, day)
  if (new Date(publication).toISOString().slice(0, 10) !== publishedOn) return false

  const expiryMonth = new Date(Date.UTC(year, month + 1, 1))
  const lastExpiryDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate()
  const expiry = Date.UTC(
    expiryMonth.getUTCFullYear(),
    expiryMonth.getUTCMonth(),
    Math.min(day, lastExpiryDay)
  )

  const today = localCalendarDay(now)
  return today >= publication && today < expiry
}
