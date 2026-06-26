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

export type ImageDataSampleSource = {
    width: number
    height: number
    data: ArrayLike<number>
}

export function clonePixelsGrid<TPixel>(
    src: ReadonlyArray<ReadonlyArray<TPixel>>
): TPixel[][] {
    return src.map((row) => row.slice())
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

export function imageDataSampleSignature(
    src: ImageDataSampleSource | null
): string {
    if (!src) return "null"
    let hash = 2166136261
    const data = src.data
    const step = Math.max(4, Math.floor(data.length / 512 / 4) * 4)
    for (let i = 0; i < data.length; i += step) {
        hash ^= data[i] ?? 0
        hash = Math.imul(hash, 16777619)
        hash ^= data[i + 1] ?? 0
        hash = Math.imul(hash, 16777619)
        hash ^= data[i + 2] ?? 0
        hash = Math.imul(hash, 16777619)
        hash ^= data[i + 3] ?? 0
        hash = Math.imul(hash, 16777619)
    }
    return `${src.width}x${src.height}:${(hash >>> 0).toString(16)}`
}
