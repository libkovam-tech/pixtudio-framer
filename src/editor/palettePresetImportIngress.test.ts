import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { importPalettePresetFromFile } from "./palettePresetImportIngress.ts"

function makeImageFile(type = "image/png") {
    return new File(["fake"], "palette-source.png", { type })
}

function makeProjectFile(contents: string, name = "saved-project.pixtudio") {
    return new File([contents], name, { type: "application/json" })
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

function makeImportedId() {
    return "imported-test"
}

describe("palette preset import ingress", () => {
    let closeBitmap: ReturnType<typeof vi.fn>

    beforeEach(() => {
        closeBitmap = vi.fn()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("imports image files through a source-agnostic File ingress", async () => {
        const rgba = new Uint8ClampedArray([
            255, 0, 0, 255,
            0, 0, 255, 255,
            255, 255, 0, 255,
            0, 255, 0, 255,
        ])
        const { canvas } = makeCanvasStub(rgba)
        const bitmap = { width: 2, height: 2, close: closeBitmap }

        vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap))
        vi.stubGlobal("document", {
            createElement: vi.fn(() => canvas),
        })

        const result = await importPalettePresetFromFile({
            file: makeImageFile(),
            makeImportedId,
            targetColors: 3,
        })

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.route).toBe("image")
        expect(result.preparedPreset.profile.name).toBe("palette-source")
        expect(result.preparedPreset.profile.colors).toHaveLength(3)
        expect(closeBitmap).toHaveBeenCalledOnce()
    })

    it("uses optional source-neutral display metadata instead of file name", async () => {
        const rgba = new Uint8ClampedArray([
            255, 0, 0, 255,
            0, 0, 255, 255,
            255, 255, 0, 255,
            0, 255, 0, 255,
        ])
        const { canvas } = makeCanvasStub(rgba)
        const bitmap = { width: 2, height: 2, close: closeBitmap }

        vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap))
        vi.stubGlobal("document", {
            createElement: vi.fn(() => canvas),
        })

        const result = await importPalettePresetFromFile({
            file: makeImageFile(),
            displayName: "Clipboard image_2026-09-02",
            makeImportedId,
            targetColors: 3,
        })

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.preparedPreset.profile.name).toBe(
            "Clipboard image_2026-09-02"
        )
    })

    it("keeps unsupported files out of the palette import pipeline", async () => {
        const createImageBitmap = vi.fn()
        vi.stubGlobal("createImageBitmap", createImageBitmap)

        const result = await importPalettePresetFromFile({
            file: new File(["notes"], "notes.txt", { type: "text/plain" }),
            makeImportedId,
        })

        expect(result).toEqual({
            ok: false,
            route: "unsupported",
            message: "This file is not supported by PIXTUDIO.",
        })
        expect(createImageBitmap).not.toHaveBeenCalled()
    })

    it("imports palette colors from a saved PIXTUDIO project file", async () => {
        const result = await importPalettePresetFromFile({
            file: makeProjectFile(
                JSON.stringify({
                    magic: "PIXTUDIO",
                    version: 2,
                    gridSize: 2,
                    palette: {
                        swatches: [
                            {
                                index: 0,
                                id: "auto-0",
                                hex: "#FF0000",
                                isUser: false,
                            },
                            {
                                index: 1,
                                id: "auto-1",
                                hex: "#00FF00",
                                isUser: false,
                            },
                        ],
                    },
                    paletteCount: 2,
                    importLayer: { cells: [0, 1, 0, 1] },
                    strokeLayer: { cells: [] },
                    ref: null,
                })
            ),
            makeImportedId,
        })

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.route).toBe("project")
        expect(result.preparedPreset.profile.name).toBe("saved-project")
        expect(result.preparedPreset.profile.colors).toEqual([
            "#FF0000",
            "#00FF00",
        ])
    })
})
