import { describe, expect, it } from "vitest"

import {
    applyImportedPaletteToPixels,
    extractImportedPaletteColors,
    prepareImportedPaletteColorsForApplication,
} from "./importedPaletteStrategy.ts"

describe("imported palette strategy", () => {
    it("extracts the same objective palette from the same color set regardless of pixel weights", () => {
        const compact = [["#FF0000", "#00FF00", "#0000FF", "#808080"]]
        const weighted = [
            ["#FF0000", "#FF0000", "#FF0000", "#00FF00"],
            ["#FF0000", "#0000FF", "#808080", "#FF0000"],
        ]

        expect(extractImportedPaletteColors(compact, 4)).toEqual(
            extractImportedPaletteColors(weighted, 4)
        )
    })

    it("uses the auto-palette color order for imported palettes", () => {
        expect(
            prepareImportedPaletteColorsForApplication([
                "#808080",
                "#0000FF",
                "#00FF00",
                "#FF0000",
            ])
        ).toEqual(["#FF0000", "#00FF00", "#0000FF", "#808080"])
    })

    it("applies the same imported palette regardless of source color order", () => {
        const pixels = [["#7F7F00", "#000080", "#808080"]]
        const a = ["#FF0000", "#00FF00", "#0000FF", "#808080"]
        const b = ["#808080", "#0000FF", "#00FF00", "#FF0000"]

        expect(applyImportedPaletteToPixels(pixels, a)).toEqual(
            applyImportedPaletteToPixels(pixels, b)
        )
    })
})
