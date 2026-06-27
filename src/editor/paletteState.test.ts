import { describe, expect, it } from "vitest"

import {
    computePaletteCountFromSwatches,
    preparePaletteTabSwitch,
    resolveSelectedSwatchAfterAutoChange,
} from "./paletteState.ts"

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

    it("keeps the transparent tool selected after auto swatches change", () => {
        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "transparent",
            })
        ).toBe("transparent")
    })

    it("keeps the selected user swatch when auto swatches are rebuilt", () => {
        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "user-0",
            })
        ).toBe("user-0")
    })

    it("uses a valid preferred swatch before the current selection", () => {
        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }, { id: "auto-1" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "auto-0",
                preferredSwatch: "auto-1",
            })
        ).toBe("auto-1")

        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "auto-0",
                preferredSwatch: "user-0",
            })
        ).toBe("user-0")
    })

    it("falls back to the first available swatch when the selected auto swatch disappears", () => {
        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "auto-9",
            })
        ).toBe("auto-0")

        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "auto-9",
            })
        ).toBe("user-0")

        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [],
                userSwatches: [],
                selectedSwatch: "auto-9",
            })
        ).toBe("transparent")
    })

    it("stores the current world before switching palette tabs", () => {
        const result = preparePaletteTabSwitch({
            state: {
                activeTab: "size",
                sizeWorld: "old-size",
                presetsWorld: "preset",
            },
            currentWorld: "current-size",
            nextTab: "presets",
            isTargetWorldCompatible: () => true,
        })

        expect(result.savedState).toEqual({
            activeTab: "size",
            sizeWorld: "current-size",
            presetsWorld: "preset",
        })
        expect(result.nextState).toEqual({
            activeTab: "presets",
            sizeWorld: "current-size",
            presetsWorld: "preset",
        })
        expect(result.targetWorld).toBe("preset")
        expect(result.targetWorldIsCompatible).toBe(true)
    })

    it("clears an incompatible target world while keeping it available for lazy rebuild", () => {
        const result = preparePaletteTabSwitch({
            state: {
                activeTab: "presets",
                sizeWorld: "stale-size",
                presetsWorld: "current-preset",
            },
            currentWorld: "current-preset",
            nextTab: "size",
            isTargetWorldCompatible: () => false,
        })

        expect(result.targetWorld).toBe("stale-size")
        expect(result.targetWorldIsCompatible).toBe(false)
        expect(result.nextState).toEqual({
            activeTab: "size",
            sizeWorld: null,
            presetsWorld: "current-preset",
        })
    })
})
