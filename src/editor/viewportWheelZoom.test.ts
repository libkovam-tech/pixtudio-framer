import { describe, expect, it } from "vitest"

import {
    getAnchoredZoomUpdate,
    getWheelZoomUpdate,
} from "./viewportWheelZoom.ts"

describe("viewport wheel zoom", () => {
    const base = {
        zoom: 1,
        panX: 0,
        panY: 0,
        anchorX: 320,
        anchorY: 320,
        viewportW: 640,
        viewportH: 640,
        minZoom: 1,
        zoomStep: 0.1,
    }

    it("zooms in on wheel up and keeps the cursor anchor stable", () => {
        const result = getWheelZoomUpdate({ ...base, deltaY: -120 })

        expect(result).toEqual({ zoom: 1.1, panX: -32, panY: -32 })
    })

    it("does not zoom out below fit-to-canvas zoom", () => {
        const result = getWheelZoomUpdate({ ...base, deltaY: 120 })

        expect(result).toBeNull()
    })

    it("zooms out by one step from an enlarged view", () => {
        const result = getWheelZoomUpdate({
            ...base,
            deltaY: 120,
            zoom: 1.3,
            panX: -96,
            panY: -96,
        })

        expect(result).toEqual({ zoom: 1.2, panX: -64, panY: -64 })
    })

    it("clamps an anchored zoom-out to the real canvas edge", () => {
        const result = getAnchoredZoomUpdate({
            ...base,
            zoom: 2,
            panX: -640,
            panY: 0,
            nextZoom: 1.9,
        })

        expect(result).toEqual({ zoom: 1.9, panX: -576, panY: 0 })
    })

    it("keeps the visible center stable while there is room to zoom", () => {
        const result = getAnchoredZoomUpdate({
            ...base,
            zoom: 1.5,
            panX: -160,
            panY: -160,
            nextZoom: 1.4,
        })

        expect(result).toEqual({ zoom: 1.4, panX: -128, panY: -128 })
    })
})
