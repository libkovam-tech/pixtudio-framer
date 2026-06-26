import {
    EXTRACT_QUANTIZATION_PROFILE,
    type QuantizationProfile,
} from "./paletteQuantizationEngine.ts"

export type FixedQuantizationProfileForHistory = Extract<
    QuantizationProfile,
    { kind: "fixed" }
>

export type ImportedPalettePresetForHistory = {
    profile: FixedQuantizationProfileForHistory
}

export function cloneSwatches<TSwatch extends object>(
    src: ReadonlyArray<TSwatch>
): TSwatch[] {
    return src.map((swatch) => ({ ...swatch }))
}

export function cloneQuantizationProfileForHistory(
    profile: QuantizationProfile
): QuantizationProfile {
    if (profile.kind === "extract") return EXTRACT_QUANTIZATION_PROFILE
    return {
        ...profile,
        colors: profile.colors.slice(),
    }
}

export function cloneImportedPalettePresetsForHistory<
    TPreset extends ImportedPalettePresetForHistory,
>(presets: ReadonlyArray<TPreset>): TPreset[] {
    return presets.map((preset) => ({
        ...preset,
        profile: cloneQuantizationProfileForHistory(
            preset.profile
        ) as FixedQuantizationProfileForHistory,
    }))
}
