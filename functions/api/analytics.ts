interface Env {
    ANALYTICS_DB: D1Database
}

type IncomingBody = {
    event?: string
    payload?: Record<string, unknown>
    path?: string
    href?: string
    referrer?: string | null
    sentAt?: string
}

const ALLOWED_EVENTS = new Set([
    "import_image",
    "export_image",
])

export const onRequestOptions: PagesFunction = async () => {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const contentType = context.request.headers.get("content-type") || ""
        if (!contentType.includes("application/json")) {
            return new Response("Unsupported content type", { status: 415 })
        }

        const body = (await context.request.json()) as IncomingBody
        const event = typeof body.event === "string" ? body.event : ""

        if (!ALLOWED_EVENTS.has(event)) {
            return new Response("Invalid event", { status: 400 })
        }

        const userAgent = context.request.headers.get("user-agent") || null
        const ip = context.request.headers.get("cf-connecting-ip") || null
        const country = context.request.cf?.country || null
        const colo = context.request.cf?.colo || null
        const rayId = context.request.headers.get("cf-ray") || null

        const payloadJson = JSON.stringify(body.payload ?? {})
        const path = typeof body.path === "string" ? body.path : null
        const href = typeof body.href === "string" ? body.href : null
        const referrer =
            typeof body.referrer === "string" ? body.referrer : null
        const sentAt = typeof body.sentAt === "string" ? body.sentAt : null

        await context.env.ANALYTICS_DB.prepare(
            `
            INSERT INTO analytics_events (
                event_name,
                payload_json,
                path,
                href,
                referrer,
                sent_at_client,
                user_agent,
                ip,
                country,
                colo,
                ray_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
        )
            .bind(
                event,
                payloadJson,
                path,
                href,
                referrer,
                sentAt,
                userAgent,
                ip,
                country,
                colo,
                rayId
            )
            .run()

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        })
    } catch {
        return new Response(JSON.stringify({ ok: false }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        })
    }
}
