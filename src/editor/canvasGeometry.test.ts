import { describe, expect, it } from "vitest"

import {
    ASPECT_RATIO_TEMPLATES,
    calculateCanvasGridGeometry,
    calculateReferenceDimensions,
    getAspectRatioTemplate,
    isAspectRatioId,
    roundHalfUp,
    type AspectRatioId,
} from "./canvasGeometry.ts"

describe("canvas geometry", () => {
    it("defines the seven supported aspect ratio templates", () => {
        expect(ASPECT_RATIO_TEMPLATES.map((template) => template.id)).toEqual([
            "16:9",
            "3:2",
            "4:3",
            "1:1",
            "3:4",
            "2:3",
            "9:16",
        ])
    })

    it("rounds halves up", () => {
        expect(roundHalfUp(94.4)).toBe(94)
        expect(roundHalfUp(94.5)).toBe(95)
        expect(roundHalfUp(94.6)).toBe(95)
    })

    it("calculates all aspect ratios from the short side", () => {
        expect(geometry(18, "16:9")).toEqual({ columns: 32, rows: 18 })
        expect(geometry(18, "3:2")).toEqual({ columns: 27, rows: 18 })
        expect(geometry(18, "4:3")).toEqual({ columns: 24, rows: 18 })
        expect(geometry(18, "1:1")).toEqual({ columns: 18, rows: 18 })
        expect(geometry(18, "3:4")).toEqual({ columns: 18, rows: 24 })
        expect(geometry(18, "2:3")).toEqual({ columns: 18, rows: 27 })
        expect(geometry(18, "9:16")).toEqual({ columns: 18, rows: 32 })
    })

    it("keeps even and odd short sides deterministic", () => {
        expect(geometry(32, "16:9")).toEqual({ columns: 57, rows: 32 })
        expect(geometry(31, "16:9")).toEqual({ columns: 55, rows: 31 })
        expect(geometry(32, "9:16")).toEqual({ columns: 32, rows: 57 })
        expect(geometry(31, "9:16")).toEqual({ columns: 31, rows: 55 })
    })

    it("keeps horizontal and vertical symmetry pairs", () => {
        expect(geometry(21, "16:9")).toEqual(reverseGeometry(21, "9:16"))
        expect(geometry(21, "3:2")).toEqual(reverseGeometry(21, "2:3"))
        expect(geometry(21, "4:3")).toEqual(reverseGeometry(21, "3:4"))
    })

    it("guards invalid aspect ratio ids", () => {
        expect(isAspectRatioId("16:9")).toBe(true)
        expect(isAspectRatioId("5:4")).toBe(false)
        expect(() => getAspectRatioTemplate("5:4" as AspectRatioId)).toThrow(
            /Unsupported aspect ratio/
        )
    })

    it("calculates reference dimensions from a 512px short side", () => {
        expect(calculateReferenceDimensions("16:9")).toEqual({
            aspectRatioId: "16:9",
            width: 910,
            height: 512,
        })
        expect(calculateReferenceDimensions("9:16")).toEqual({
            aspectRatioId: "9:16",
            width: 512,
            height: 910,
        })
        expect(calculateReferenceDimensions("3:2")).toEqual({
            aspectRatioId: "3:2",
            width: 768,
            height: 512,
        })
        expect(calculateReferenceDimensions("1:1")).toEqual({
            aspectRatioId: "1:1",
            width: 512,
            height: 512,
        })
    })
})

function geometry(gridSize: number, aspectRatioId: AspectRatioId) {
    const result = calculateCanvasGridGeometry({ gridSize, aspectRatioId })
    return { columns: result.columns, rows: result.rows }
}

function reverseGeometry(gridSize: number, aspectRatioId: AspectRatioId) {
    const result = calculateCanvasGridGeometry({ gridSize, aspectRatioId })
    return { columns: result.rows, rows: result.columns }
}
