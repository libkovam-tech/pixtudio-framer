import { describe, expect, it } from "vitest"

import {
    buildPalettePresentationModel,
    getPresetButtonLabel,
    type FixedPaletteProfile,
} from "./palettePresentation.ts"
import { QUANTIZATION_PROFILES } from "./paletteQuantizationEngine.ts"

const importedProfile: FixedPaletteProfile = {
    kind: "fixed",
    id: "imported-1",
    name: "Imported",
    source: "imported",
    colors: ["#112233"],
}

describe("palette presentation", () => {
    it("filters hidden builtin presets and preserves imported presets", () => {
        const model = buildPalettePresentationModel({
            activeTab: "presets",
            quantizationProfile: QUANTIZATION_PROFILES.sunset,
            activePresetButtonId: QUANTIZATION_PROFILES.sunset.id,
            hiddenPresetIds: [QUANTIZATION_PROFILES.grayscale.id],
            autoSwatches: [],
            userSwatches: [],
            importedPalettePresets: [
                {
                    id: "imported-1",
                    name: "Imported",
                    profile: importedProfile,
                },
            ],
        })

        expect(model.visibleBuiltinPresetProfiles.map((profile) => profile.id)).toEqual([
            QUANTIZATION_PROFILES.sunset.id,
            QUANTIZATION_PROFILES.bw.id,
        ])
        expect(model.importedPresetProfiles).toEqual([importedProfile])
    })

    it("shows fixed preset swatches only for the active fixed preset tab", () => {
        expect(
            buildPalettePresentationModel({
                activeTab: "presets",
                quantizationProfile: QUANTIZATION_PROFILES.sunset,
                activePresetButtonId: QUANTIZATION_PROFILES.sunset.id,
                hiddenPresetIds: [],
                autoSwatches: [],
                userSwatches: [],
                importedPalettePresets: [],
            }).shouldShowPresetSwatches
        ).toBe(true)

        expect(
            buildPalettePresentationModel({
                activeTab: "size",
                quantizationProfile: QUANTIZATION_PROFILES.sunset,
                activePresetButtonId: QUANTIZATION_PROFILES.sunset.id,
                hiddenPresetIds: [],
                autoSwatches: [],
                userSwatches: [],
                importedPalettePresets: [],
            }).shouldShowPresetSwatches
        ).toBe(false)
    })

    it("sorts visible auto swatches separately from user swatches", () => {
        const model = buildPalettePresentationModel({
            activeTab: "size",
            quantizationProfile: { kind: "extract" },
            activePresetButtonId: null,
            hiddenPresetIds: [],
            autoSwatches: [
                {
                    id: "transparent",
                    color: "",
                    isTransparent: true,
                    isUser: false,
                },
                {
                    id: "blue",
                    color: "#0000FF",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "red",
                    color: "#FF0000",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            userSwatches: [
                {
                    id: "user-blue",
                    color: "#0000FF",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            importedPalettePresets: [],
        })

        expect(model.sortedAutoSwatchesForUI.map((swatch) => swatch.id)).toEqual([
            "red",
            "blue",
        ])
        expect(model.sortedUserSwatchesForUI.map((swatch) => swatch.id)).toEqual([
            "user-blue",
        ])
    })

    it("uses a compact label for the black-white preset", () => {
        expect(getPresetButtonLabel(QUANTIZATION_PROFILES.bw)).toBe("BLACK/WHITE")
    })
})
