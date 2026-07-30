import {
    EXTRACT_QUANTIZATION_PROFILE,
    type QuantizationProfile,
} from "./paletteQuantizationEngine.ts"
import {
    resolveMethodProfile,
    resolveMethodProfilesByPaletteContext,
    resolveDeConfettiByPaletteContext,
    type DeConfettiByPaletteContext,
    type DeConfettiSettings,
    type MethodProfile,
    type MethodProfilesByPaletteContext,
    type ResolvedMethodProfilesByPaletteContext,
} from "./QuantizationCore.ts"

export type FixedQuantizationProfileForHistory = Extract<
    QuantizationProfile,
    { kind: "fixed" }
>

export type ImportedPalettePresetForHistory = {
    id: string
    name: string
    profile: FixedQuantizationProfileForHistory
}

export type EditorHistorySwatch = {
    id: string
    color: string
    isTransparent: boolean
    isUser: boolean
}

export type ImageDataSampleSource = {
    width: number
    height: number
    data: ArrayLike<number>
}

export type EditorCommittedState<
    TPixel = string | null,
    TSwatch extends EditorHistorySwatch = EditorHistorySwatch,
    TImportedPreset extends ImportedPalettePresetForHistory = ImportedPalettePresetForHistory,
> = {
    gridSize: number
    paletteCount: number
    brushSize: number
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    showImage: boolean
    hasOriginalImageData: boolean
    referenceSnapshot?: ImageDataSampleSource | null
    autoSwatches: TSwatch[]
    userSwatches: TSwatch[]
    selectedSwatch: string | "transparent"
    methodProfilesByPaletteContext?: MethodProfilesByPaletteContext
    methodProfile?: MethodProfile
    deConfettiByPaletteContext?: DeConfettiByPaletteContext
    quantizationProfile?: QuantizationProfile
    importedPalettePresets?: TImportedPreset[]
    hiddenPresetIds?: string[]
    activePaletteTab?: "size" | "presets"
    deletedAutoPaletteColors?: string[]
    autoOverrides: Record<
        string,
        {
            hex?: string
            isTransparent?: boolean
        }
    >
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
        applicationColors: profile.applicationColors?.slice(),
    }
}

export function cloneMethodProfileForHistory(
    profile: MethodProfile | undefined
): MethodProfile {
    return { ...resolveMethodProfile(profile) }
}

export function cloneMethodProfilesByPaletteContextForHistory(
    profiles: MethodProfilesByPaletteContext | undefined
): ResolvedMethodProfilesByPaletteContext {
    const resolved = resolveMethodProfilesByPaletteContext(profiles)
    return {
        auto: { ...resolved.auto },
        fixed: { ...resolved.fixed },
    }
}

export function cloneDeConfettiSettingsForHistory(
    settings: DeConfettiSettings | undefined
): DeConfettiSettings {
    const resolved = resolveDeConfettiByPaletteContext({
        auto: settings,
    }).auto
    return { ...resolved }
}

export function cloneDeConfettiByPaletteContextForHistory(
    settingsByContext: DeConfettiByPaletteContext | undefined
): Required<DeConfettiByPaletteContext> {
    const resolved = resolveDeConfettiByPaletteContext(settingsByContext)
    return {
        auto: { ...resolved.auto },
        fixed: { ...resolved.fixed },
    }
}

function areColorArraysEqual(
    a: ReadonlyArray<string> | undefined,
    b: ReadonlyArray<string> | undefined
): boolean {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false
    }
    return true
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

export function areCommittedQuantizationProfilesEqual(
    a: QuantizationProfile | undefined,
    b: QuantizationProfile | undefined
): boolean {
    const aa = a ?? EXTRACT_QUANTIZATION_PROFILE
    const bb = b ?? EXTRACT_QUANTIZATION_PROFILE
    if (aa.kind !== bb.kind) return false
    if (aa.kind === "extract" || bb.kind === "extract") return true
    if (
        aa.id !== bb.id ||
        aa.name !== bb.name ||
        aa.source !== bb.source ||
        aa.applicationSource !== bb.applicationSource ||
        aa.applicationProfileId !== bb.applicationProfileId ||
        aa.colors.length !== bb.colors.length
    ) {
        return false
    }
    for (let i = 0; i < aa.colors.length; i += 1) {
        if (aa.colors[i] !== bb.colors[i]) return false
    }
    return areColorArraysEqual(aa.applicationColors, bb.applicationColors)
}

export function areCommittedMethodProfilesEqual(
    a: MethodProfile | undefined,
    b: MethodProfile | undefined
): boolean {
    const aa = resolveMethodProfile(a)
    const bb = resolveMethodProfile(b)
    return aa.methodId === bb.methodId && aa.colorSpaceId === bb.colorSpaceId
}

export function areCommittedMethodProfilesByPaletteContextEqual(
    a: MethodProfilesByPaletteContext | undefined,
    b: MethodProfilesByPaletteContext | undefined
): boolean {
    const aa = resolveMethodProfilesByPaletteContext(a)
    const bb = resolveMethodProfilesByPaletteContext(b)
    return (
        aa.auto.methodId === bb.auto.methodId &&
        aa.auto.colorSpaceId === bb.auto.colorSpaceId &&
        aa.fixed.methodId === bb.fixed.methodId &&
        aa.fixed.colorSpaceId === bb.fixed.colorSpaceId
    )
}

export function areCommittedDeConfettiByPaletteContextEqual(
    a: DeConfettiByPaletteContext | undefined,
    b: DeConfettiByPaletteContext | undefined
): boolean {
    const aa = resolveDeConfettiByPaletteContext(a)
    const bb = resolveDeConfettiByPaletteContext(b)
    return (
        aa.auto.enabled === bb.auto.enabled &&
        aa.auto.tieBreaker === bb.auto.tieBreaker &&
        aa.fixed.enabled === bb.fixed.enabled &&
        aa.fixed.tieBreaker === bb.fixed.tieBreaker
    )
}

export function areImportedPalettePresetsEqual<
    TPreset extends ImportedPalettePresetForHistory,
>(a: TPreset[] | undefined, b: TPreset[] | undefined): boolean {
    const aa = a ?? []
    const bb = b ?? []
    if (aa.length !== bb.length) return false

    for (let i = 0; i < aa.length; i += 1) {
        const ap = aa[i]
        const bp = bb[i]
        if (!bp || ap.id !== bp.id || ap.name !== bp.name) return false
        if (!areCommittedQuantizationProfilesEqual(ap.profile, bp.profile)) {
            return false
        }
    }

    return true
}

export function areEditorCommittedStatesEqual<
    TPixel,
    TSwatch extends EditorHistorySwatch,
    TImportedPreset extends ImportedPalettePresetForHistory,
>(
    a: EditorCommittedState<TPixel, TSwatch, TImportedPreset> | null,
    b: EditorCommittedState<TPixel, TSwatch, TImportedPreset> | null
): boolean {
    if (a === b) return true
    if (!a || !b) return false
    if (a.gridSize !== b.gridSize) return false
    if (a.paletteCount !== b.paletteCount) return false
    if (a.brushSize !== b.brushSize) return false
    if (a.showImage !== b.showImage) return false
    if (a.selectedSwatch !== b.selectedSwatch) return false
    if (a.hasOriginalImageData !== b.hasOriginalImageData) return false

    const aDeleted = [...(a.deletedAutoPaletteColors ?? [])].sort()
    const bDeleted = [...(b.deletedAutoPaletteColors ?? [])].sort()
    if (aDeleted.length !== bDeleted.length) return false
    for (let i = 0; i < aDeleted.length; i += 1) {
        if (aDeleted[i] !== bDeleted[i]) return false
    }

    if (
        !areCommittedQuantizationProfilesEqual(
            a.quantizationProfile,
            b.quantizationProfile
        )
    ) {
        return false
    }
    const aMethodProfiles = a.methodProfilesByPaletteContext ?? {
        auto: a.methodProfile,
    }
    const bMethodProfiles = b.methodProfilesByPaletteContext ?? {
        auto: b.methodProfile,
    }
    if (
        !areCommittedMethodProfilesByPaletteContextEqual(
            aMethodProfiles,
            bMethodProfiles
        )
    ) {
        return false
    }
    if (
        !areCommittedDeConfettiByPaletteContextEqual(
            a.deConfettiByPaletteContext,
            b.deConfettiByPaletteContext
        )
    ) {
        return false
    }
    if (
        !areImportedPalettePresetsEqual(
            a.importedPalettePresets,
            b.importedPalettePresets
        )
    ) {
        return false
    }

    const aHidden = [...(a.hiddenPresetIds ?? [])].sort()
    const bHidden = [...(b.hiddenPresetIds ?? [])].sort()
    if (aHidden.length !== bHidden.length) return false
    for (let i = 0; i < aHidden.length; i += 1) {
        if (aHidden[i] !== bHidden[i]) return false
    }

    const aOverrides = a.autoOverrides || {}
    const bOverrides = b.autoOverrides || {}
    const aOverrideKeys = Object.keys(aOverrides).sort()
    const bOverrideKeys = Object.keys(bOverrides).sort()
    if (aOverrideKeys.length !== bOverrideKeys.length) return false

    for (let i = 0; i < aOverrideKeys.length; i += 1) {
        if (aOverrideKeys[i] !== bOverrideKeys[i]) return false
        const key = aOverrideKeys[i]
        const aValue = aOverrides[key]
        const bValue = bOverrides[key]
        if ((aValue?.hex ?? null) !== (bValue?.hex ?? null)) return false
        if (!!aValue?.isTransparent !== !!bValue?.isTransparent) return false
    }

    if (!areSwatchListsEqual(a.autoSwatches, b.autoSwatches)) return false
    if (!areSwatchListsEqual(a.userSwatches, b.userSwatches)) return false
    if (!arePixelGridsEqual(a.imagePixels, b.imagePixels)) return false
    if (!arePixelGridsEqual(a.overlayPixels, b.overlayPixels)) return false

    return true
}

function areSwatchListsEqual<TSwatch extends EditorHistorySwatch>(
    a: TSwatch[],
    b: TSwatch[]
): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        const aSwatch = a[i]
        const bSwatch = b[i]
        if (!bSwatch) return false
        if (aSwatch.id !== bSwatch.id) return false
        if (aSwatch.color !== bSwatch.color) return false
        if (aSwatch.isTransparent !== bSwatch.isTransparent) return false
        if (aSwatch.isUser !== bSwatch.isUser) return false
    }
    return true
}

function arePixelGridsEqual<TPixel>(a: TPixel[][], b: TPixel[][]): boolean {
    if (a.length !== b.length) return false
    for (let row = 0; row < a.length; row += 1) {
        const aRow = a[row] || []
        const bRow = b[row] || []
        if (aRow.length !== bRow.length) return false
        for (let column = 0; column < aRow.length; column += 1) {
            if ((aRow[column] ?? null) !== (bRow[column] ?? null)) {
                return false
            }
        }
    }
    return true
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
