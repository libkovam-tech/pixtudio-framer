import { describe, expect, it } from "vitest"

import { calculateCanvasLayoutPolicy } from "./canvasLayoutPolicy.ts"

describe("canvas layout policy", () => {
    it("fits desktop horizontal canvases by height and lets them exceed the anchor column", () => {
        const layout = calculateCanvasLayoutPolicy({
            deviceClass: "desktop",
            viewportWidth: 1600,
            viewportHeight: 1000,
            anchorWidth: 640,
            topMenuHeight: 50,
            controlsHeight: 280,
            columns: 57,
            rows: 32,
        })

        expect(layout.canvasRegion).toMatchObject({
            width: 640,
            height: 640,
        })
        expect(layout.actualCanvasRect.width).toBeCloseTo(1140)
        expect(layout.actualCanvasRect.height).toBe(640)
        expect(layout.actualCanvasRect.x).toBe(0)
        expect(layout.canvasRegion.x).toBeCloseTo(250)
        expect(layout.interactiveRect).toEqual(layout.actualCanvasRect)
    })

    it("fits mobile horizontal canvases by width with fit-to-content canvas height", () => {
        const layout = calculateCanvasLayoutPolicy({
            deviceClass: "mobile",
            viewportWidth: 390,
            viewportHeight: 844,
            anchorWidth: 390,
            topMenuHeight: 50,
            controlsHeight: 300,
            columns: 57,
            rows: 32,
        })

        expect(layout.canvasRegion.width).toBe(390)
        expect(layout.actualCanvasRect.width).toBe(390)
        expect(layout.actualCanvasRect.height).toBeCloseTo(218.947)
        expect(layout.controlsRegion.y).toBeCloseTo(268.947)
    })

    it("keeps square and vertical behavior identical on mobile and desktop", () => {
        const mobile = calculateCanvasLayoutPolicy({
            deviceClass: "mobile",
            viewportWidth: 390,
            viewportHeight: 844,
            anchorWidth: 390,
            topMenuHeight: 50,
            controlsHeight: 300,
            columns: 32,
            rows: 57,
        })
        const desktop = calculateCanvasLayoutPolicy({
            deviceClass: "desktop",
            viewportWidth: 1400,
            viewportHeight: 1000,
            anchorWidth: 390,
            topMenuHeight: 50,
            controlsHeight: 300,
            columns: 32,
            rows: 57,
        })

        expect(mobile.actualCanvasRect).toEqual(desktop.actualCanvasRect)
        expect(mobile.canvasRegion).toEqual(desktop.canvasRegion)
    })

    it("fits vertical canvases inside the square anchor without stretching the canvas region", () => {
        const layout = calculateCanvasLayoutPolicy({
            deviceClass: "mobile",
            viewportWidth: 390,
            viewportHeight: 844,
            anchorWidth: 390,
            topMenuHeight: 50,
            controlsHeight: 300,
            columns: 32,
            rows: 57,
        })

        expect(layout.canvasRegion).toMatchObject({
            width: 390,
            height: 390,
        })
        expect(layout.actualCanvasRect.width).toBeCloseTo(218.947)
        expect(layout.actualCanvasRect.height).toBe(390)
        expect(layout.actualCanvasRect.x).toBeCloseTo(85.526)
        expect(layout.controlsRegion.y).toBe(440)
    })

    it("reports scale needed to keep the whole layout inside the viewport", () => {
        const layout = calculateCanvasLayoutPolicy({
            deviceClass: "desktop",
            viewportWidth: 900,
            viewportHeight: 900,
            anchorWidth: 640,
            topMenuHeight: 50,
            controlsHeight: 280,
            columns: 57,
            rows: 32,
        })

        expect(layout.contentWidth).toBeCloseTo(1140)
        expect(layout.fitScale).toBeCloseTo(900 / 1140)
    })
})
