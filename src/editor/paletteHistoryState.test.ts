import { describe, expect, it } from "vitest"

import { EXTRACT_QUANTIZATION_PROFILE } from "./paletteQuantizationEngine.ts"
import {
    cloneImportedPalettePresetsForHistory,
    cloneQuantizationProfileForHistory,
    cloneSwatches,
} from "./paletteHistoryState.ts"

describe("palette history state", () => {
    it("clones swatch objects without sharing swatch references", () => {
        const swatches = [
            {
                id: "auto-0",
                color: "#112233",
                isTransparent: false,
                isUser: false,
            },
        ]

        const cloned = cloneSwatches(swatches)

        expect(cloned).toEqual(swatches)
        expect(cloned).not.toBe(swatches)
        expect(cloned[0]).not.toBe(swatches[0])
    })

    it("keeps the extract profile canonical for history", () => {
        expect(cloneQuantizationProfileForHistory({ kind: "extract" })).toBe(
            EXTRACT_QUANTIZATION_PROFILE
        )
    })

    it("clones fixed profile color arrays", () => {
        const profile = {
            kind: "fixed" as const,
            id: "imported-a",
            name: "Imported A",
            source: "imported" as const,
            colors: ["#000000", "#FFFFFF"],
        }

        const cloned = cloneQuantizationProfileForHistory(profile)

        expect(cloned).toEqual(profile)
        expect(cloned).not.toBe(profile)
        expect(cloned.kind).toBe("fixed")
        if (cloned.kind !== "fixed") throw new Error("expected fixed profile")
        expect(cloned.colors).toEqual(profile.colors)
        expect(cloned.colors).not.toBe(profile.colors)
    })

    it("clones imported preset profiles without sharing profile color arrays", () => {
        const presets = [
            {
                id: "preset-a",
                name: "Preset A",
                profile: {
                    kind: "fixed" as const,
                    id: "profile-a",
                    name: "Profile A",
                    source: "imported" as const,
                    colors: ["#123456", "#654321"],
                },
            },
        ]

        const cloned = cloneImportedPalettePresetsForHistory(presets)

        expect(cloned).toEqual(presets)
        expect(cloned).not.toBe(presets)
        expect(cloned[0]).not.toBe(presets[0])
        expect(cloned[0]?.profile).not.toBe(presets[0]?.profile)
        expect(cloned[0]?.profile.colors).not.toBe(presets[0]?.profile.colors)
    })
})
