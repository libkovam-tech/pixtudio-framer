export type AnalyticsEventName =
    | "import_image"
    | "export_image"

type AnalyticsPayload = Record<string, unknown>

export function track(event: AnalyticsEventName, payload: AnalyticsPayload = {}) {
    if (typeof window === "undefined") return

    fetch("/analytics", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            event,
            payload,
            path: window.location.pathname,
            href: window.location.href,
            referrer: document.referrer || null,
            sentAt: new Date().toISOString(),
        }),
        keepalive: true,
    }).catch(() => {
        // analytics must never break UX
    })
}
