interface Env {
    ANALYTICS: AnalyticsEngineDataset
}

type IncomingAnalyticsEvent = {
    event?: string
    ts?: number
    path?: string
    meta?: Record<string, unknown>
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const body =
            (await context.request.json()) as IncomingAnalyticsEvent

        const event =
            typeof body?.event === "string" && body.event.trim()
                ? body.event.trim()
                : "unknown"

        const ts =
            typeof body?.ts === "number" && Number.isFinite(body.ts)
                ? body.ts
                : Date.now()

        const path =
            typeof body?.path === "string" && body.path
                ? body.path
                : new URL(context.request.url).pathname

        const meta =
            body?.meta && typeof body.meta === "object"
                ? JSON.stringify(body.meta)
                : "{}"

        context.env.ANALYTICS.writeDataPoint({
            indexes: [event],
            blobs: [path, meta],
            doubles: [ts],
        })

        return new Response(null, { status: 204 })
    } catch {
        return new Response(null, { status: 204 })
    }
}
