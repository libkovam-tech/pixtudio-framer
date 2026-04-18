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
})
