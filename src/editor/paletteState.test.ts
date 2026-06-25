import { describe, expect, it } from "vitest"

import { computePaletteCountFromSwatches } from "./paletteState.ts"

describe("palette state", () => {
    it("counts auto and user swatches that paint visible colors", () => {
        const autoSwatches = [
            { id: "auto-0" },
            { id: "auto-1", isTransparent: false },
        ]
        const userSwatches = [{ id: "user-0" }]

        expect(
            computePaletteCountFromSwatches(autoSwatches, userSwatches, {
                min: 2,
                max: 32,
            })
        ).toBe(3)
    })

    it("excludes transparent tool and transparent swatches from the palette count", () => {
        const autoSwatches = [
            { id: "auto-0" },
            { id: "transparent" },
            { id: "auto-1", isTransparent: true },
        ]
        const userSwatches = [
            { id: "user-0", isTransparent: true },
            { id: "user-1" },
        ]

        expect(
            computePaletteCountFromSwatches(autoSwatches, userSwatches, {
                min: 2,
                max: 32,
            })
        ).toBe(2)
    })

    it("clamps the count to the project palette bounds", () => {
        expect(
            computePaletteCountFromSwatches([], [], {
                min: 2,
                max: 32,
            })
        ).toBe(2)

        expect(
            computePaletteCountFromSwatches(
                Array.from({ length: 40 }, (_, index) => ({
                    id: `auto-${index}`,
                })),
                [],
                { min: 2, max: 32 }
            )
        ).toBe(32)
    })

    it("ignores nullish swatches defensively", () => {
        expect(
            computePaletteCountFromSwatches(
                [null, undefined, { id: "auto-0" }],
                null,
                { min: 2, max: 32 }
            )
        ).toBe(2)
    })
})
