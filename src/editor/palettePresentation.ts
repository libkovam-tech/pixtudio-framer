import {
    QUANTIZATION_PROFILES,
    type PaletteTab,
    type QuantizationProfile,
    type QuantizationSwatch,
} from "./paletteQuantizationEngine.ts"
import { sortSwatchesForUI } from "./paletteSwatchSorting.ts"

export type FixedPaletteProfile = Extract<QuantizationProfile, { kind: "fixed" }>

export type ImportedPalettePresetPresentation = {
    id: string
    name: string
    profile: FixedPaletteProfile
}

export type PalettePresentationInput = {
    activeTab: PaletteTab
    quantizationProfile: QuantizationProfile
    activePresetButtonId: string | null
    hiddenPresetIds: string[]
    autoSwatches: QuantizationSwatch[]
    userSwatches: QuantizationSwatch[]
    importedPalettePresets: ImportedPalettePresetPresentation[]
}

export type PalettePresentationModel = {
    sortedAutoSwatchesForUI: QuantizationSwatch[]
    sortedUserSwatchesForUI: QuantizationSwatch[]
    visibleBuiltinPresetProfiles: FixedPaletteProfile[]
    importedPresetProfiles: FixedPaletteProfile[]
    shouldShowPresetSwatches: boolean
}

export function getPresetButtonLabel(profile: FixedPaletteProfile) {
    return profile.id === "black-white-2" ? "BLACK/WHITE" : profile.name
}

export function buildPalettePresentationModel({
    activeTab,
    quantizationProfile,
    activePresetButtonId,
    hiddenPresetIds,
    autoSwatches,
    userSwatches,
    importedPalettePresets,
}: PalettePresentationInput): PalettePresentationModel {
    const builtinPresetProfiles: FixedPaletteProfile[] = [
        QUANTIZATION_PROFILES.sunset,
        QUANTIZATION_PROFILES.grayscale,
        QUANTIZATION_PROFILES.bw,
    ]

    return {
        sortedAutoSwatchesForUI: sortSwatchesForUI(autoSwatches).filter(
            (swatch) => !swatch.isTransparent && swatch.id !== "transparent"
        ),
        sortedUserSwatchesForUI: sortSwatchesForUI(userSwatches),
        visibleBuiltinPresetProfiles: builtinPresetProfiles.filter(
            (profile) => !hiddenPresetIds.includes(profile.id)
        ),
        importedPresetProfiles: importedPalettePresets.map(
            (preset) => preset.profile
        ),
        shouldShowPresetSwatches:
            activeTab === "presets" &&
            quantizationProfile.kind === "fixed" &&
            activePresetButtonId === quantizationProfile.id,
    }
}
