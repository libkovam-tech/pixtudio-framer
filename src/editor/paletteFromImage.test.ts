import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { extractPaletteFromImageFile } from "./paletteFromImage.ts"

function makeImageFile(type = "image/png") {
    return new File(["fake"], "palette-source.png", { type })
}

function makeCanvasStub(data: Uint8ClampedArray) {
    const ctx = {
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low" as ImageSmoothingQuality,
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data })),
    }

    const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ctx),
    }

    return { canvas, ctx }
}

describe("paletteFromImage", () => {
    let closeBitmap: ReturnType<typeof vi.fn>

    beforeEach(() => {
        closeBitmap = vi.fn()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("extracts a 32-color palette source from image pixels and closes the bitmap", async () => {
        const rgba = new Uint8ClampedArray([
            255, 0, 0, 255,
            0, 0, 255, 255,
            0, 255, 0, 8,
            255, 255, 0, 255,
        ])
        const { canvas, ctx } = makeCanvasStub(rgba)
        const bitmap = { width: 2, height: 2, close: closeBitmap }

        vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap))
        vi.stubGlobal("document", {
            createElement: vi.fn(() => canvas),
        })

        const palette = await extractPaletteFromImageFile(makeImageFile(), {
            targetColors: 3,
            sampleMaxSide: 32,
        })

        expect(palette).toHaveLength(3)
        expect(new Set(palette)).toEqual(
            new Set(["#FF0000", "#0000FF", "#FFFF00"])
        )
        expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2, 2)
        expect(closeBitmap).toHaveBeenCalledOnce()
    })

    it("samples the full image through a bounded canvas size", async () => {
        const rgba = new Uint8ClampedArray(100 * 50 * 4)
        const { canvas } = makeCanvasStub(rgba)
        const bitmap = { width: 400, height: 200, close: closeBitmap }

        vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap))
        vi.stubGlobal("document", {
            createElement: vi.fn(() => canvas),
        })

        await extractPaletteFromImageFile(makeImageFile(), {
            targetColors: 32,
            sampleMaxSide: 100,
        })

        expect(canvas.width).toBe(100)
        expect(canvas.height).toBe(50)
        expect(closeBitmap).toHaveBeenCalledOnce()
    })

    it("rejects non-image files before decoding", async () => {
        const createImageBitmap = vi.fn()
        vi.stubGlobal("createImageBitmap", createImageBitmap)

        await expect(
            extractPaletteFromImageFile(makeImageFile("application/json"))
        ).rejects.toThrow("expected an image file")
        expect(createImageBitmap).not.toHaveBeenCalled()
    })
})
