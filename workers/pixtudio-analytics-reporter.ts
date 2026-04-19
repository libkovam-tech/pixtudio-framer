type AnalyticsEventName = "import_image" | "export_image"

type Env = {
    ANALYTICS_DB: D1Database
    REPORT_EMAIL: {
        send(message: {
            to: string
            from: string
            subject: string
            html: string
            text: string
        }): Promise<void>
    }
    ANALYTICS_REPORT_SECRET_HASH?: string
    ANALYTICS_REPORT_SENDER: string
    ANALYTICS_REPORT_RECIPIENT: string
}

type ReportEvent = {
    event_name: AnalyticsEventName
    country: string | null
    created_at: string
}

type ReportPeriod = {
    title: string
    startUtc: Date
    endUtc: Date
    localYear: number
    localMonth: number
}

const TIME_ZONE = "Asia/Jerusalem"
const MANUAL_RATE_LIMIT_KEY = "manual_report"
const MANUAL_RATE_LIMIT_MS = 5 * 60 * 1000
const REPORT_EVENT_NAMES: AnalyticsEventName[] = ["import_image", "export_image"]

const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}

function emptyResponse() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    })
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => htmlEscapes[char])
}

function parseUtcSqlDate(value: string) {
    return new Date(value.replace(" ", "T") + "Z")
}

function getLocalParts(date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(date)

    const get = (type: string) =>
        Number(parts.find((part) => part.type === type)?.value || "0")

    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour: get("hour"),
        minute: get("minute"),
    }
}

function formatReportDate(value: string) {
    const parts = getLocalParts(parseUtcSqlDate(value))
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
        parts.day
    ).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(
        parts.minute
    ).padStart(2, "0")}`
}

function monthNameRu(year: number, month: number) {
    const date = new Date(Date.UTC(year, month - 1, 1))
    return new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(date)
}

function getCurrentMonthPeriod(now: Date): ReportPeriod {
    const local = getLocalParts(now)
    return buildMonthPeriod(local.year, local.month, "Текущий месяц")
}

function getPreviousMonthPeriod(now: Date): ReportPeriod {
    const local = getLocalParts(now)
    let year = local.year
    let month = local.month - 1

    if (month < 1) {
        month = 12
        year -= 1
    }

    return buildMonthPeriod(year, month, "Отчёт за месяц")
}

function buildMonthPeriod(year: number, month: number, prefix: string): ReportPeriod {
    const approxStart = new Date(Date.UTC(year, month - 1, 1))
    const approxEnd = new Date(Date.UTC(year, month, 1))

    return {
        title: `${prefix}: ${monthNameRu(year, month)}`,
        startUtc: new Date(approxStart.getTime() - 2 * 24 * 60 * 60 * 1000),
        endUtc: new Date(approxEnd.getTime() + 2 * 24 * 60 * 60 * 1000),
        localYear: year,
        localMonth: month,
    }
}

function toSqlUtc(date: Date) {
    return date.toISOString().slice(0, 19).replace("T", " ")
}

function isInsideLocalMonth(event: ReportEvent, period: ReportPeriod) {
    const parts = getLocalParts(parseUtcSqlDate(event.created_at))
    return parts.year === period.localYear && parts.month === period.localMonth
}

function eventLabel(eventName: AnalyticsEventName) {
    if (eventName === "import_image") return "Импорт"
    if (eventName === "export_image") return "Экспорт"
    return eventName
}

function countryLabel(country: string | null) {
    if (!country) return "Неизвестно"

    try {
        const displayNames = new Intl.DisplayNames(["ru"], { type: "region" })
        return displayNames.of(country) || country
    } catch {
        return country
    }
}

async function loadReportEvents(env: Env, period: ReportPeriod) {
    const { results } = await env.ANALYTICS_DB.prepare(
        `
        SELECT event_name, country, created_at
        FROM analytics_events
        WHERE event_name IN (?, ?)
          AND created_at >= ?
          AND created_at < ?
        ORDER BY created_at DESC
        `
    )
        .bind(
            REPORT_EVENT_NAMES[0],
            REPORT_EVENT_NAMES[1],
            toSqlUtc(period.startUtc),
            toSqlUtc(period.endUtc)
        )
        .all<ReportEvent>()

    return results.filter((event) => isInsideLocalMonth(event, period))
}

function buildReportHtml(period: ReportPeriod, events: ReportEvent[]) {
    const importCount = events.filter(
        (event) => event.event_name === "import_image"
    ).length
    const exportCount = events.filter(
        (event) => event.event_name === "export_image"
    ).length

    const rows = events.length
        ? events
              .map(
                  (event) => `
                    <tr>
                        <td style="border:2px solid #111827;padding:10px;">${escapeHtml(eventLabel(event.event_name))}</td>
                        <td style="border:2px solid #111827;padding:10px;">${escapeHtml(formatReportDate(event.created_at))}</td>
                        <td style="border:2px solid #111827;padding:10px;">${escapeHtml(countryLabel(event.country))}</td>
                    </tr>
                `
              )
              .join("")
        : `
            <tr>
                <td colspan="3" style="text-align:center;color:#5f5f5f;padding:24px 12px;">Нет событий</td>
            </tr>
        `

    return `<!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PIXTUDIO Analytics</title>
</head>
<body style="margin:0;background:#f3eed7;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:760px;margin:0 auto;padding:28px 16px;">
        <div style="background:#ffffff;border:4px solid #111827;padding:22px;">
            <h1 style="margin:0 0 8px;font-size:24px;line-height:1.2;">PIXTUDIO Analytics</h1>
            <p style="margin:0 0 18px;color:#4b5563;font-size:14px;">${escapeHtml(
                period.title
            )}</p>

            <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 18px;">
                <tr>
                    <td style="background:#e9d8a6;border:2px solid #111827;padding:12px;font-weight:700;">Импорт</td>
                    <td style="background:#e9d8a6;border:2px solid #111827;padding:12px;font-size:20px;font-weight:700;text-align:right;">${importCount}</td>
                    <td style="background:#d7ebe5;border:2px solid #111827;padding:12px;font-weight:700;">Экспорт</td>
                    <td style="background:#d7ebe5;border:2px solid #111827;padding:12px;font-size:20px;font-weight:700;text-align:right;">${exportCount}</td>
                </tr>
            </table>

            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                    <tr>
                        <th align="left" style="background:#111827;color:#ffffff;border:2px solid #111827;padding:10px;">Действие</th>
                        <th align="left" style="background:#111827;color:#ffffff;border:2px solid #111827;padding:10px;">Дата</th>
                        <th align="left" style="background:#111827;color:#ffffff;border:2px solid #111827;padding:10px;">Страна</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`
}

function buildReportText(period: ReportPeriod, events: ReportEvent[]) {
    const lines = [`PIXTUDIO Analytics`, period.title, ""]

    if (!events.length) {
        lines.push("Нет событий")
        return lines.join("\n")
    }

    for (const event of events) {
        lines.push(
            `${eventLabel(event.event_name)} | ${formatReportDate(
                event.created_at
            )} | ${countryLabel(event.country)}`
        )
    }

    return lines.join("\n")
}

async function sendReportEmail(env: Env, period: ReportPeriod) {
    const events = await loadReportEvents(env, period)
    const html = buildReportHtml(period, events)
    const text = buildReportText(period, events)

    await env.REPORT_EMAIL.send({
        from: env.ANALYTICS_REPORT_SENDER,
        to: env.ANALYTICS_REPORT_RECIPIENT,
        subject: "PIXTUDIO analytics report",
        html,
        text,
    })
}

async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
    )
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
}

function timingSafeEqual(a: string, b: string) {
    if (a.length !== b.length) return false

    let diff = 0
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }

    return diff === 0
}

async function isValidCode(env: Env, code: unknown) {
    if (
        typeof code !== "string" ||
        !code ||
        !env.ANALYTICS_REPORT_SECRET_HASH
    ) {
        return false
    }

    const incomingHash = await sha256Hex(code)
    return timingSafeEqual(
        incomingHash,
        env.ANALYTICS_REPORT_SECRET_HASH.trim().toLowerCase()
    )
}

async function ensureRateLimitTable(env: Env) {
    await env.ANALYTICS_DB.prepare(
        `
        CREATE TABLE IF NOT EXISTS analytics_report_rate_limits (
            rate_key TEXT PRIMARY KEY,
            sent_at TEXT NOT NULL
        )
        `
    ).run()
}

async function canSendManualReport(env: Env, now: Date) {
    await ensureRateLimitTable(env)

    const row = await env.ANALYTICS_DB.prepare(
        `
        SELECT sent_at
        FROM analytics_report_rate_limits
        WHERE rate_key = ?
        `
    )
        .bind(MANUAL_RATE_LIMIT_KEY)
        .first<{ sent_at: string }>()

    if (!row?.sent_at) return true

    const lastSentAt = parseUtcSqlDate(row.sent_at)
    return now.getTime() - lastSentAt.getTime() >= MANUAL_RATE_LIMIT_MS
}

async function markManualReportSent(env: Env, now: Date) {
    await env.ANALYTICS_DB.prepare(
        `
        INSERT INTO analytics_report_rate_limits (rate_key, sent_at)
        VALUES (?, ?)
        ON CONFLICT(rate_key) DO UPDATE SET sent_at = excluded.sent_at
        `
    )
        .bind(MANUAL_RATE_LIMIT_KEY, toSqlUtc(now))
        .run()
}

async function handleManualReport(request: Request, env: Env) {
    if (request.method === "OPTIONS") return emptyResponse()
    if (request.method !== "POST") return emptyResponse()

    try {
        const body = (await request.json()) as { code?: unknown }
        const valid = await isValidCode(env, body.code)

        if (!valid) return emptyResponse()

        const now = new Date()
        const allowed = await canSendManualReport(env, now)
        if (!allowed) return emptyResponse()

        await markManualReportSent(env, now)
        await sendReportEmail(env, getCurrentMonthPeriod(now))
    } catch {
        // Intentionally silent.
    }

    return emptyResponse()
}

export default {
    fetch(request: Request, env: Env) {
        return handleManualReport(request, env)
    },

    async scheduled(_event: ScheduledEvent, env: Env) {
        await sendReportEmail(env, getPreviousMonthPeriod(new Date()))
    },
}
