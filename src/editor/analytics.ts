export type AnalyticsEventName =
    | "entered_editor"
    | "completed_first_action"

type AnalyticsPayload = Record<string, unknown>

const SESSION_STORAGE_KEY = "pixtudio.analytics.sent.v1"

const memorySent = new Set<string>()

function readSentEvents(): Set<string> {
    if (typeof window === "undefined") return new Set()

    try {
        const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
        if (!raw) return new Set()
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return new Set()
        return new Set(parsed.filter((x) => typeof x === "string"))
    } catch {
        return new Set()
    }
}

function writeSentEvents(next: Set<string>) {
    if (typeof window === "undefined") return

    try {
        window.sessionStorage.setItem(
            SESSION_STORAGE_KEY,
            JSON.stringify(Array.from(next))
        )
    } catch {
        // fail-open
    }
}

function markEventAsSent(event: AnalyticsEventName) {
    memorySent.add(event)

    const persisted = readSentEvents()
    persisted.add(event)
    writeSentEvents(persisted)
}

function wasEventSent(event: AnalyticsEventName): boolean {
    if (memorySent.has(event)) return true

    const persisted = readSentEvents()
    if (persisted.has(event)) {
        memorySent.add(event)
        return true
    }

    return false
}

export function track(event: AnalyticsEventName, payload: AnalyticsPayload = {}) {
    if (typeof window === "undefined") return

    const body = {
        event,
        payload,
        path: window.location.pathname,
        href: window.location.href,
        referrer: document.referrer || null,
        sentAt: new Date().toISOString(),
    }

    fetch("/analytics", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        keepalive: true,
    }).catch(() => {
        // analytics must never break UX
    })
}

export function trackOncePerSession(
    event: AnalyticsEventName,
    payload: AnalyticsPayload = {}
) {
    if (wasEventSent(event)) return

    markEventAsSent(event)
    track(event, payload)
}
