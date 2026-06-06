import { describe, expect, it } from "vitest"

import {
    extendImportedPaletteProfile,
    removeImportedPaletteProfileColor,
    removeImportedPaletteProfileColorByHex,
} from "./palettePresetExtension.ts"
import { prepareImportedPaletteColorsForApplication } from "./importedPaletteStrategy.ts"

describe("palette preset extension", () => {
    const profile = {
        kind: "fixed" as const,
        source: "imported" as const,
        id: "imported-demo",
        name: "Demo",
        colors: ["#001219", "#E9D8A6"],
    }

    it("adds a valid color to an imported palette profile", () => {
        const result = extendImportedPaletteProfile(profile, "#ffffff")

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#001219", "#E9D8A6", "#FFFFFF"],
            },
            colorIndex: 2,
            added: true,
        })
    })

    it("reuses an existing color instead of adding a duplicate", () => {
        const result = extendImportedPaletteProfile(profile, "#e9d8a6")

        expect(result).toEqual({
            profile,
            colorIndex: 1,
            added: false,
        })
    })

    it("rejects invalid colors", () => {
        expect(extendImportedPaletteProfile(profile, "white")).toBeNull()
    })

    it("removes a color from an imported palette profile", () => {
        const result = removeImportedPaletteProfileColor(profile, 0)

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#E9D8A6"],
            },
            removed: true,
        })
    })

    it("removes the displayed imported swatch color when application order differs from profile order", () => {
        const unsortedProfile = {
            ...profile,
            colors: ["#FFFFFF", "#FF0000", "#00FF00"],
        }
        const displayedColors = prepareImportedPaletteColorsForApplication(
            unsortedProfile.colors
        )

        expect(displayedColors[0]).toBe("#FF0000")

        const result = removeImportedPaletteProfileColorByHex(
            unsortedProfile,
            displayedColors[0]
        )

        expect(result).toEqual({
            profile: {
                ...unsortedProfile,
                colors: ["#FFFFFF", "#00FF00"],
            },
            removed: true,
        })
    })

    it("keeps imported palette profiles with at least one color", () => {
        const result = removeImportedPaletteProfileColor(
            { ...profile, colors: ["#001219"] },
            0
        )

        expect(result).toEqual({
            profile: { ...profile, colors: ["#001219"] },
            removed: false,
        })
    })

    it("ignores invalid color indexes when removing", () => {
        expect(removeImportedPaletteProfileColor(profile, -1)).toEqual({
            profile,
            removed: false,
        })
        expect(removeImportedPaletteProfileColor(profile, 99)).toEqual({
            profile,
            removed: false,
        })
        expect(removeImportedPaletteProfileColorByHex(profile, "white")).toEqual(
            {
                profile,
                removed: false,
            }
        )
    })
})
