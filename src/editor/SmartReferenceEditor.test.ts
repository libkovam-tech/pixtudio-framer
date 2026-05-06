import { describe, expect, it, vi } from "vitest"

import {
    ZERO_SMART_REFERENCE_ADJUSTMENTS,
    buildReferenceSnapshot,
} from "./SmartReferenceEditor.tsx"

class TestImageData {
    data: Uint8ClampedArray<ArrayBuffer>
    width: number
    height: number
    colorSpace = "srgb" as const

    constructor(
        data: Uint8ClampedArray<ArrayBuffer>,
        width: number,
        height: number
    ) {
        this.data = data
        this.width = width
        this.height = height
    }
}

vi.stubGlobal("ImageData", TestImageData)

describe("Smart Reference invariants", () => {
    it("buildReferenceSnapshot(base, ZERO) returns an exact pixel copy", () => {
        const bytes = new Uint8ClampedArray([
            0, 32, 64, 255,
            128, 160, 192, 255,
            255, 8, 16, 128,
            4, 5, 6, 0,
        ])
        const base = new ImageData(bytes, 2, 2)

        const snapshot = buildReferenceSnapshot(
            base,
            ZERO_SMART_REFERENCE_ADJUSTMENTS
        )

        expect(snapshot).not.toBeNull()
        expect(snapshot).not.toBe(base)
        expect(snapshot?.width).toBe(base.width)
        expect(snapshot?.height).toBe(base.height)
        expect(Array.from(snapshot?.data ?? [])).toEqual(Array.from(base.data))
    })

    it("tonal band sliders affect their own brightness quarters", () => {
        const bytes = new Uint8ClampedArray([
            32, 32, 32, 255,
            128, 128, 128, 255,
            224, 224, 224, 255,
        ])
        const base = new ImageData(bytes, 3, 1)

        const shadows = buildReferenceSnapshot(base, {
            ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
            shadows: 100,
        })
        const midtones = buildReferenceSnapshot(base, {
            ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
            midtones: 100,
        })
        const highlights = buildReferenceSnapshot(base, {
            ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
            highlights: 100,
        })

        expect(shadows).not.toBeNull()
        expect(midtones).not.toBeNull()
        expect(highlights).not.toBeNull()

        const channel = (snapshot: ImageData | null, pixel: number) =>
            snapshot?.data[pixel * 4] ?? 0

        const shadowDarkDelta = channel(shadows, 0) - 32
        const shadowBrightDelta = channel(shadows, 2) - 224
        const midDarkDelta = channel(midtones, 0) - 32
        const midMiddleDelta = channel(midtones, 1) - 128
        const midBrightDelta = channel(midtones, 2) - 224
        const highlightDarkDelta = channel(highlights, 0) - 32
        const highlightBrightDelta = channel(highlights, 2) - 224

        expect(shadowDarkDelta).toBeGreaterThan(shadowBrightDelta)
        expect(midMiddleDelta).toBeGreaterThan(midDarkDelta)
        expect(midMiddleDelta).toBeGreaterThan(midBrightDelta)
        expect(highlightBrightDelta).toBeGreaterThan(highlightDarkDelta)
    })

    it("shadows cover a slightly wider dark range than the first quarter", () => {
        const bytes = new Uint8ClampedArray([
            68, 68, 68, 255,
            96, 96, 96, 255,
        ])
        const base = new ImageData(bytes, 2, 1)

        const snapshot = buildReferenceSnapshot(base, {
            ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
            shadows: 100,
        })

        expect(snapshot).not.toBeNull()
        if (!snapshot) return

        expect(snapshot.data[0]).toBeGreaterThan(68)
        expect(snapshot.data[4]).toBe(96)
    })
})
