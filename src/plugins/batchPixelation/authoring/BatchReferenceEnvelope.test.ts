import { describe, expect, it } from "vitest"
import type { EditorCommittedState } from "../../../editor/editorHistoryState.ts"
import { BatchReferenceEnvelope, ReferenceNotReadyError } from "./BatchReferenceEnvelope.ts"

function editorState(gridSize: number): EditorCommittedState {
    return {
        gridSize,
        aspectRatioId: "1:1",
        columns: gridSize,
        rows: gridSize,
        paletteCount: 2,
        brushSize: 1,
        imagePixels: Array.from({ length: gridSize }, () => Array(gridSize).fill("auto-0")),
        overlayPixels: Array.from({ length: gridSize }, () => Array(gridSize).fill(null)),
        showImage: true,
        hasOriginalImageData: true,
        referenceSnapshot: { width: 1, height: 1, data: new Uint8Array(4) },
        autoSwatches: [{ id: "auto-0", color: "rgb(0, 0, 0)", isTransparent: false, isUser: false }],
        userSwatches: [],
        selectedSwatch: "auto-0",
        quantizationProfile: { kind: "extract" },
        activePaletteTab: "size",
        autoOverrides: {},
    }
}

function crop(sessionId: string) {
    return {
        kind: "crop" as const,
        sessionId,
        referenceInputGeometry: { width: 1, height: 1 },
        drawGeometry: {
            outputWidth: 512,
            outputHeight: 512,
            cx: 256,
            cy: 256,
            drawWidth: 512,
            drawHeight: 512,
            rotationRadians: 0,
        },
    }
}

describe("BatchReferenceEnvelope", () => {
    it("seals only the current session's latest committed values", () => {
        const envelope = new BatchReferenceEnvelope("current")
        envelope.accept(crop("foreign"))
        envelope.updateStatus({ sessionId: "foreign", settled: true, cropOpen: false })
        expect(() => envelope.seal()).toThrow("not settled")
        expect(() => envelope.seal()).toThrow(ReferenceNotReadyError)
        envelope.accept(crop("current"))
        envelope.updateStatus({ sessionId: "current", settled: true, cropOpen: false })
        expect(() => envelope.seal()).toThrow(ReferenceNotReadyError)
        envelope.accept({ kind: "editor", sessionId: "current", state: editorState(16) })
        envelope.accept({ kind: "editor", sessionId: "current", state: editorState(24) })
        envelope.accept({ kind: "smart", sessionId: "current", adjustments: {
            exposure: 0, whiteBalance: 0.8, contrast: 0, saturation: 0,
            shadows: 0, midtones: 0, highlights: 0,
        }, whiteBalance: null })
        envelope.updateStatus({ sessionId: "current", settled: true, cropOpen: false })
        const sealed = envelope.seal()
        expect(sealed.recipe.grid.size).toBe(24)
        expect(sealed.recipe.smart.whiteBalance.kind).toBe("identity")
        expect(Object.isFrozen(sealed.recipe)).toBe(true)
        expect(JSON.stringify(sealed)).not.toContain("referenceSnapshot")
        expect(JSON.parse(JSON.stringify(sealed)).recipe.grid.size).toBe(24)
    })

    it("refuses unsupported spatial or swatch mutation state", () => {
        const envelope = new BatchReferenceEnvelope("current")
        envelope.accept(crop("current"))
        envelope.accept({ kind: "editor", sessionId: "current", state: editorState(16) })
        envelope.accept({ kind: "editor", sessionId: "current", state: {
            ...editorState(16),
            overlayPixels: [["auto-0"]],
        } })
        envelope.updateStatus({ sessionId: "current", settled: true, cropOpen: false })
        expect(() => envelope.seal()).toThrow("Unsupported spatial")
    })

    it("uses the effective committed profile when the Palette tab lags after History", () => {
        const envelope = new BatchReferenceEnvelope("current")
        envelope.accept(crop("current"))
        envelope.accept({ kind: "editor", sessionId: "current", state: {
            ...editorState(16),
            activePaletteTab: "presets",
        } })
        envelope.updateStatus({ sessionId: "current", settled: true, cropOpen: false })
        expect(envelope.seal().recipe.palette.source).toBe("auto")
    })

    it("seals dynamic Auto settings only when the committed palette is Auto", () => {
        const envelope = new BatchReferenceEnvelope("current")
        envelope.accept(crop("current"))
        envelope.accept({ kind: "editor", sessionId: "current", state: { ...editorState(16), paletteCount: 3 } })
        envelope.updateStatus({ sessionId: "current", settled: true, cropOpen: false })
        expect(envelope.seal().recipe.palette).toMatchObject({
            version: 2, source: "auto", method: "default", colorSpace: "default", colorCount: 3,
        })
    })

    it("keeps an imported palette fixed", () => {
        const envelope = new BatchReferenceEnvelope("current")
        envelope.accept(crop("current"))
        envelope.accept({ kind: "editor", sessionId: "current", state: {
            ...editorState(16),
            quantizationProfile: { kind: "fixed", source: "imported", id: "test-preset",
                name: "Test Preset", colors: ["rgb(0, 0, 0)"] },
        } })
        envelope.updateStatus({ sessionId: "current", settled: true, cropOpen: false })
        expect(envelope.seal().recipe.palette).toMatchObject({ version: 1, source: "imported" })
    })
})
