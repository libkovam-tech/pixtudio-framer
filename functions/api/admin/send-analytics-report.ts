interface Env {
    ANALYTICS_REPORTER?: Fetcher
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

export const onRequestOptions: PagesFunction = async () => {
    return emptyResponse()
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        if (!context.env.ANALYTICS_REPORTER) {
            return emptyResponse()
        }

        const proxied = new Request(
            "https://pixtudio-internal/send-analytics-report",
            {
                method: "POST",
                headers: context.request.headers,
                body: context.request.body,
            }
        )

        await context.env.ANALYTICS_REPORTER.fetch(proxied)
    } catch {
        // Intentionally silent.
    }

    return emptyResponse()
}
