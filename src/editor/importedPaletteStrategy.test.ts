import { describe, expect, it } from "vitest"

import {
    USE_LEGACY_IMPORTED_PALETTE_EXTRACTOR_ROLLBACK,
    applyImportedPaletteToPixels,
    extractImportedPaletteColors,
    prepareImportedPaletteColorsForApplication,
    runImportedPaletteExtractorGateway,
} from "./importedPaletteStrategy.ts"

describe("imported palette strategy", () => {
    it("routes imported palette extraction through the hybrid objective candidate", () => {
        const pixels = [["#FF0000", "#00FF00", "#0000FF", "#808080"]]

        expect(USE_LEGACY_IMPORTED_PALETTE_EXTRACTOR_ROLLBACK).toBe(false)
        expect(
            runImportedPaletteExtractorGateway({
                pixels,
                targetColors: 4,
            }).colors
        ).toEqual(extractImportedPaletteColors(pixels, 4))
    })

    it("lets pixel weight influence the hybrid objective palette", () => {
        const compact = [["#FF0000", "#00FF00", "#0000FF", "#808080"]]
        const weighted = [
            ["#FF0000", "#FF0000", "#FF0000", "#00FF00"],
            ["#FF0000", "#0000FF", "#808080", "#FF0000"],
        ]

        expect(extractImportedPaletteColors(compact, 2)).not.toEqual(
            extractImportedPaletteColors(weighted, 2)
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
