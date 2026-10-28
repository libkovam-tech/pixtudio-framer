import { describe, expect, it } from "vitest"
import { computeExportSize, computeRectangularExportGeometry, pixelizeFromImageDominant } from "./pixelRaster.ts"

function raster(width: number, height: number, values: number[][]) {
    return { width, height, data: new Uint8ClampedArray(values.flat()) }
}

describe("canonical sampling and export geometry", () => {
    it("resolves histogram ties by darker rounded luminance", () => {
        const input = raster(2, 1, [[240, 240, 240, 255], [16, 16, 16, 255]])
        expect(pixelizeFromImageDominant(input, 1)).toEqual([["rgb(16, 16, 16)"]])
    })
    it("skips only zero alpha, preserving ordinary dominant-sampling semantics", () => {
        const input = raster(3, 1, [[255, 0, 0, 0], [0, 255, 0, 1], [0, 0, 255, 255]])
        expect(pixelizeFromImageDominant(input, { columns: 3, rows: 1 })).toEqual([[null, "rgb(0, 255, 0)", "rgb(0, 0, 255)"]])
        expect(pixelizeFromImageDominant(input, 1)).toEqual([["rgb(0, 0, 255)"]])
    })
    it("uses floor cell boundaries and rounds components before counting", () => {
        const input = raster(3, 1, [[7, 9, 250, 255], [8, 8, 248, 255], [15, 15, 249, 255]])
        expect(pixelizeFromImageDominant(input, { columns: 2, rows: 1 })).toEqual([["rgb(0, 16, 255)", "rgb(16, 16, 255)"]])
    })
    it.each([8, 16, 24, 31, 32, 64, 96, 128])( "keeps integer cells for grid %s", gridSize => {
        const size = computeExportSize(gridSize)
        expect(size % gridSize).toBe(0)
        expect(Math.abs(size - 512)).toBeLessThanOrEqual(gridSize / 2)
        expect(computeRectangularExportGeometry({ gridSize, columns: gridSize, rows: gridSize * 2 }))
            .toEqual({ cellSize: size / gridSize, width: size, height: size * 2 })
    })
    it("uses one cell when the lower multiple would be zero", () => {
        expect(computeExportSize(1024)).toBe(1024)
        expect(computeExportSize(2048)).toBe(2048)
    })
})
