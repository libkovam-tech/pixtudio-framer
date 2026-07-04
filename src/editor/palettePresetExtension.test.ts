import { describe, expect, it } from "vitest"

import {
    extendFixedPaletteProfile,
    findPaletteColorIndexByHex,
    makeImportedPalettePreset,
    makeImportedPalettePresetName,
    prepareFixedPaletteSwatchDelete,
    removeFixedPaletteProfileColor,
    removeFixedPaletteProfileColorByHex,
    upsertImportedPalettePreset,
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

    it("derives imported palette preset names from supported file names", () => {
        expect(makeImportedPalettePresetName("summer.palette.pixtudio")).toBe(
            "summer.palette"
        )
        expect(makeImportedPalettePresetName("  portrait.PNG  ")).toBe(
            "portrait"
        )
        expect(makeImportedPalettePresetName(".png")).toBe("Imported palette")
    })

    it("creates imported palette preset records from fixed profiles", () => {
        expect(makeImportedPalettePreset(profile)).toEqual({
            id: profile.id,
            name: profile.name,
            profile,
        })
    })

    it("appends imported palette preset records to a registry", () => {
        expect(upsertImportedPalettePreset([], profile)).toEqual([
            {
                id: profile.id,
                name: profile.name,
                profile,
            },
        ])
    })

    it("updates existing imported palette preset records in a registry", () => {
        const updatedProfile = {
            ...profile,
            name: "Updated",
            colors: ["#FFFFFF"],
        }

        expect(
            upsertImportedPalettePreset(
                [{ id: profile.id, name: profile.name, profile }],
                updatedProfile
            )
        ).toEqual([
            {
                id: profile.id,
                name: "Updated",
                profile: updatedProfile,
            },
        ])
    })

    it("adds a valid color to an imported palette profile", () => {
        const result = extendFixedPaletteProfile(profile, "#ffffff")

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#001219", "#E9D8A6", "#FFFFFF"],
            },
            colorIndex: 2,
            added: true,
        })
    })

    it("can extend an editable copy of a built-in fixed palette profile", () => {
        const builtinProfile = {
            kind: "fixed" as const,
            source: "builtin" as const,
            id: "sunset-10",
            name: "SUNSET",
            colors: ["#001219", "#E9D8A6"],
        }

        const result = extendFixedPaletteProfile(builtinProfile, "#ffffff")

        expect(result).toEqual({
            profile: {
                ...builtinProfile,
                colors: ["#001219", "#E9D8A6", "#FFFFFF"],
            },
            colorIndex: 2,
            added: true,
        })
    })

    it("reuses an existing color instead of adding a duplicate", () => {
        const result = extendFixedPaletteProfile(profile, "#e9d8a6")

        expect(result).toEqual({
            profile,
            colorIndex: 1,
            added: false,
        })
    })

    it("rejects invalid colors", () => {
        expect(extendFixedPaletteProfile(profile, "white")).toBeNull()
    })

    it("finds a color in the application palette order", () => {
        const displayedColors = prepareImportedPaletteColorsForApplication([
            "#FFFFFF",
            "#00FFFD",
            "#001219",
        ])

        expect(findPaletteColorIndexByHex(displayedColors, "#00fffd")).toBe(
            displayedColors.indexOf("#00FFFD")
        )
        expect(findPaletteColorIndexByHex(displayedColors, "cyan")).toBeNull()
    })

    it("removes a color from an imported palette profile", () => {
        const result = removeFixedPaletteProfileColor(profile, 0)

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

        const result = removeFixedPaletteProfileColorByHex(
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
        const result = removeFixedPaletteProfileColor(
            { ...profile, colors: ["#001219"] },
            0
        )

        expect(result).toEqual({
            profile: { ...profile, colors: ["#001219"] },
            removed: false,
        })
    })

    it("ignores invalid color indexes when removing", () => {
        expect(removeFixedPaletteProfileColor(profile, -1)).toEqual({
            profile,
            removed: false,
        })
        expect(removeFixedPaletteProfileColor(profile, 99)).toEqual({
            profile,
            removed: false,
        })
        expect(removeFixedPaletteProfileColorByHex(profile, "white")).toEqual(
            {
                profile,
                removed: false,
            }
        )
    })

    it("prepares fixed palette swatch deletion with an active fallback selection", () => {
        const result = prepareFixedPaletteSwatchDelete({
            profile,
            swatchColor: "#E9D8A6",
            swatchId: "auto-1",
            swatchIndex: 1,
            selectedSwatch: "auto-1",
        })

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#001219"],
            },
            selectedSwatch: "auto-0",
            removed: true,
        })
    })

    it("keeps fixed palette selection when deleting an inactive swatch", () => {
        const result = prepareFixedPaletteSwatchDelete({
            profile,
            swatchColor: "#E9D8A6",
            swatchId: "auto-1",
            swatchIndex: 1,
            selectedSwatch: "auto-0",
        })

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#001219"],
            },
            selectedSwatch: "auto-0",
            removed: true,
        })
    })

    it("keeps fixed palette delete preparation unchanged for invalid swatch indexes", () => {
        const result = prepareFixedPaletteSwatchDelete({
            profile,
            swatchColor: "#E9D8A6",
            swatchId: "auto-1",
            swatchIndex: null,
            selectedSwatch: "auto-1",
        })

        expect(result).toEqual({
            profile,
            selectedSwatch: "auto-1",
            removed: false,
        })
    })
})
