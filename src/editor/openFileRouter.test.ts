import { describe, expect, it } from "vitest"

import {
    isLikelyRasterImageFile,
    routeOpenFile,
} from "./openFileRouter.ts"

describe("open file router", () => {
    it("routes pixtudio saves before image candidates", () => {
        expect(
            routeOpenFile({
                name: "portrait.pixtudio",
                type: "image/png",
            })
        ).toBe("project")
    })

    it("routes application/json as a project save candidate", () => {
        expect(
            routeOpenFile({
                name: "project",
                type: "application/json",
            })
        ).toBe("project")
    })

    it("routes images by MIME type or known raster extension", () => {
        expect(routeOpenFile({ name: "photo.bin", type: "image/webp" })).toBe(
            "image"
        )
        expect(routeOpenFile({ name: "photo.PNG", type: "" })).toBe("image")
    })

    it("does not route SVG through the raster image pipe", () => {
        expect(routeOpenFile({ name: "vector.svg", type: "image/svg+xml" })).toBe(
            "unsupported"
        )
    })

    it("rejects unsupported files", () => {
        expect(routeOpenFile({ name: "notes.txt", type: "text/plain" })).toBe(
            "unsupported"
        )
        expect(routeOpenFile(null)).toBe("unsupported")
    })

    it("recognizes extension-only image files for decode handoff", () => {
        expect(isLikelyRasterImageFile({ name: "camera.JPG", type: "" })).toBe(
            true
        )
    })
})

