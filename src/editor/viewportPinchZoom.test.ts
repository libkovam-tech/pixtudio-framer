import { describe, expect, it } from "vitest"

import {
    getCenter,
    getDistance,
    getPinchZoomUpdate,
} from "./viewportPinchZoom.ts"

describe("viewport pinch zoom", () => {
    const base = {
        startZoom: 1,
        startPanX: 0,
        startPanY: 0,
        startCenter: { x: 320, y: 320 },
        startDistance: 200,
        currentCenter: { x: 320, y: 320 },
        currentDistance: 260,
        viewportW: 640,
        viewportH: 640,
        minZoom: 1,
    }

    it("zooms around the two-finger center", () => {
        const result = getPinchZoomUpdate(base)

        expect(result).toEqual({ zoom: 1.3, panX: -96, panY: -96 })
    })

    it("does not zoom below fit-to-canvas zoom", () => {
        const result = getPinchZoomUpdate({
            ...base,
            currentDistance: 120,
        })

        expect(result).toBeNull()
    })

    it("clamps panned pinch zoom to the real canvas edge", () => {
        const result = getPinchZoomUpdate({
            ...base,
            startZoom: 2,
            startPanX: -640,
            startPanY: 0,
            currentDistance: 180,
        })

        expect(result).toEqual({ zoom: 1.8, panX: -512, panY: 0 })
    })

    it("derives distance and center from two touch points", () => {
        const a = { x: 10, y: 20 }
        const b = { x: 40, y: 60 }

        expect(getDistance(a, b)).toBe(50)
        expect(getCenter(a, b)).toEqual({ x: 25, y: 40 })
    })
})
