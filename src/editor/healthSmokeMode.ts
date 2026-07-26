export const HEALTH_SMOKE_QUERY_PARAM = "pixtudio-health-smoke"
export const HEALTH_SMOKE_STORAGE_KEY = "pixtudio:health-smoke"

export function shouldForceDownloadFallbackForHealthSmoke() {
    if (typeof window === "undefined") return false

    try {
        if (
            new URLSearchParams(window.location.search).get(
                HEALTH_SMOKE_QUERY_PARAM
            ) === "1"
        ) {
            window.sessionStorage.setItem(HEALTH_SMOKE_STORAGE_KEY, "1")
            return true
        }

        return window.sessionStorage.getItem(HEALTH_SMOKE_STORAGE_KEY) === "1"
    } catch {
        return false
    }
}
