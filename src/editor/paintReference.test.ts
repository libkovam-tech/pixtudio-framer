import { describe, expect, it } from "vitest"

import {
    buildFixedPaletteHexAndIdMap,
    overlayTransparentSnapshotOverColor,
    requantizePaintRefsToOverlayPixels,
    toHexUpperOrNull,
    transparentMaskHexForIndex,
    type PaintReferenceSwatch,
} from "./paintReference.ts"

const swatch = (
    id: string,
    color: string,
    isTransparent = false
): PaintReferenceSwatch => ({
    id,
    color,
    isTransparent,
    isUser: id.startsWith("user-"),
})

describe("paint reference", () => {
    it("normalizes paint reference colors to uppercase hex", () => {
        expect(toHexUpperOrNull(null)).toBeNull()
        expect(toHexUpperOrNull("#abc")).toBe("#AABBCC")
        expect(toHexUpperOrNull("rgb(255, 128, 0)")).toBe("#FF8000")
        expect(toHexUpperOrNull("hsl(120, 100%, 50%)")).toBe("#00FF00")
    })

    it("builds a fixed palette map while preserving first color owners", () => {
        const result = buildFixedPaletteHexAndIdMap({
            baseAuto: [
                swatch("auto-0", "#ff0000"),
                swatch("auto-transparent", "#000000", true),
                swatch("auto-1", "rgb(0, 255, 0)"),
            ],
            user: [
                swatch("user-0", "#FF0000"),
                swatch("user-1", "#0000ff"),
            ],
        })

        expect(result.paletteHex).toEqual(["#FF0000", "#00FF00", "#0000FF"])
        expect(result.idByHex.get("#FF0000")).toBe("auto-0")
        expect(result.idByHex.get("#00FF00")).toBe("auto-1")
        expect(result.idByHex.get("#0000FF")).toBe("user-1")
    })

    it("overlays exact mask snapshots over the color overlay", () => {
        const colorOverlay = [
            ["auto-0", "auto-1"],
            [null, "auto-0"],
        ]
        const exactOverlay = [
            [null, "user-0"],
            ["transparent", null],
        ]

        expect(
            overlayTransparentSnapshotOverColor({
                colorOverlay,
                transparentOverlay: exactOverlay,
            })
        ).toEqual([
            ["auto-0", "user-0"],
            ["transparent", "auto-0"],
        ])
    })

    it("requantizes color, user, and transparent paint references together", () => {
        const colorSnapshot = { tag: "color" } as unknown as ImageData
        const userSnapshot = { tag: "user" } as unknown as ImageData
        const transparentSnapshot = {
            tag: "transparent",
        } as unknown as ImageData
        const maskHex0 = transparentMaskHexForIndex(0)

        const result = requantizePaintRefsToOverlayPixels({
            colorSnapshot,
            userSnapshot,
            userValueByHex: new Map([[maskHex0, "user-0"]]),
            transparentSnapshot,
            transparentValueByHex: new Map([[maskHex0, "transparent"]]),
            gridSize: 2,
            baseAuto: [swatch("auto-0", "#ff0000"), swatch("auto-1", "#00ff00")],
            user: [swatch("user-0", "#0000ff")],
            pixelizeSnapshot: (snapshot) => {
                if (snapshot === colorSnapshot) {
                    return [
                        ["rgb(255, 0, 0)", "rgb(0, 255, 0)"],
                        ["rgb(0, 255, 0)", "rgb(255, 0, 0)"],
                    ]
                }
                if (snapshot === userSnapshot) {
                    return [
                        [null, maskHex0],
                        [null, null],
                    ]
                }
                return [
                    [null, null],
                    [maskHex0, null],
                ]
            },
            quantizeToFixedPalette: (pixels) => pixels,
        })

        expect(result).toEqual([
            ["auto-0", "user-0"],
            ["transparent", "auto-0"],
        ])
    })
})
