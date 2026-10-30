import { describe, expect, it, vi } from "vitest"
import { onRequestPost } from "./analytics"

describe("analytics endpoint", () => {
    it("stores a Batch DOWNLOAD click through the existing D1 event table", async () => {
        const run = vi.fn(async () => ({}))
        const bind = vi.fn(() => ({ run }))
        const prepare = vi.fn(() => ({ bind }))
        const context = {
            request: new Request("https://pixtudio.app/api/analytics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event: "batch_pixelation_download_click", payload: {}, path: "/plugins/batch-pixelation/" }),
            }),
            env: { ANALYTICS_DB: { prepare } },
        } as unknown as Parameters<typeof onRequestPost>[0]

        const response = await onRequestPost(context) as Response

        expect(response.status).toBe(200)
        expect(prepare).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO analytics_events"))
        expect(bind.mock.calls[0][0]).toBe("batch_pixelation_download_click")
        expect(run).toHaveBeenCalledOnce()
    })

    it("does not accept other Batch event names", async () => {
        const prepare = vi.fn()
        const context = {
            request: new Request("https://pixtudio.app/api/analytics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event: "batch_pixelation_prepare" }),
            }),
            env: { ANALYTICS_DB: { prepare } },
        } as unknown as Parameters<typeof onRequestPost>[0]

        const response = await onRequestPost(context) as Response

        expect(response.status).toBe(400)
        expect(prepare).not.toHaveBeenCalled()
    })
})
