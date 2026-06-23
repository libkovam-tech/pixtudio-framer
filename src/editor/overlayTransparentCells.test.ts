import { describe, expect, it } from "vitest"

import {
    isTransparentOverlayPixel,
    preserveTransparentOverlayPixels,
} from "./overlayTransparentCells.ts"

const TRANSPARENT_PIXEL = "__PX_TRANSPARENT__" as const

describe("overlay transparent cells", () => {
    const swatches = [
        { id: "auto-0", isTransparent: false },
        { id: "auto-transparent", isTransparent: true },
        { id: "user-0", isTransparent: false },
    ]

    it("identifies explicit transparent pixels and transparent swatch ids", () => {
        expect(
            isTransparentOverlayPixel("auto-transparent", {
                transparentPixel: TRANSPARENT_PIXEL,
                swatches,
            })
        ).toBe(true)
        expect(
            isTransparentOverlayPixel(TRANSPARENT_PIXEL, {
                transparentPixel: TRANSPARENT_PIXEL,
                swatches,
            })
        ).toBe(true)
        expect(
            isTransparentOverlayPixel("auto-0", {
                transparentPixel: TRANSPARENT_PIXEL,
                swatches,
            })
        ).toBe(false)
        expect(
            isTransparentOverlayPixel(null, {
                transparentPixel: TRANSPARENT_PIXEL,
                swatches,
            })
        ).toBe(false)
    })

    it("preserves transparent overlay cells after bitmap requantize", () => {
        const overlayAfterRequantize = [
            [null, "auto-0", null],
            [null, null, "user-0"],
        ]
        const logicalOverlayBeforeRebuild = [
            ["auto-transparent", "auto-0", null],
            [TRANSPARENT_PIXEL, "missing", "user-0"],
        ]

        expect(
            preserveTransparentOverlayPixels({
                overlay: overlayAfterRequantize,
                transparentSource: logicalOverlayBeforeRebuild,
                transparentPixel: TRANSPARENT_PIXEL,
                swatches,
            })
        ).toEqual([
            ["auto-transparent", "auto-0", null],
            [TRANSPARENT_PIXEL, null, "user-0"],
        ])
    })
})
