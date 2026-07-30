import type { QuantizationProfile, PaletteTab } from "./paletteQuantizationEngine.ts"
import type {
    DeConfettiByPaletteContext,
    MethodProfilesByPaletteContext,
    ResolvedDeConfettiByPaletteContext,
    ResolvedMethodProfilesByPaletteContext,
} from "./QuantizationCore.ts"
import {
    applyProjectSnapshotV2AutoOverrides,
    buildProjectSnapshotV2RuntimeLayers,
    decodeProjectSnapshotRefBytes,
    resolveProjectSnapshotV2DeConfettiByPaletteContext,
    resolveProjectSnapshotV2MethodProfilesByPaletteContext,
    resolveProjectSnapshotV2QuantizationProfile,
    type AutoSwatchOverridesMapV2,
    type ProjectSnapshotV2,
    type ValidatedSnapshotV2,
} from "./projectSnapshotV2.ts"

export type ProjectLoadSwatch = {
    id: string
    color: string
    isTransparent: boolean
    isUser: boolean
}

export type ProjectLoadImportedPalettePreset = {
    id: string
    name: string
    profile: Extract<QuantizationProfile, { kind: "fixed" }>
}

export type ProjectLoadEditorState<TTransparent> = {
    gridSize: number
    paletteCount: number
    brushSize: number
    imagePixels: (string | null | TTransparent)[][]
    overlayPixels: (string | null | TTransparent)[][]
    showImage: boolean
    hasOriginalImageData: boolean
    referenceSnapshot?: ImageData | null
    autoSwatches: ProjectLoadSwatch[]
    userSwatches: ProjectLoadSwatch[]
    selectedSwatch: string | "transparent"
    methodProfilesByPaletteContext?: MethodProfilesByPaletteContext
    deConfettiByPaletteContext?: DeConfettiByPaletteContext
    quantizationProfile?: QuantizationProfile
    importedPalettePresets?: ProjectLoadImportedPalettePreset[]
    hiddenPresetIds?: string[]
    activePaletteTab?: PaletteTab
    deletedAutoPaletteColors?: string[]
    autoOverrides: AutoSwatchOverridesMapV2
}

export type ProjectLoadNextState<TTransparent> = {
    project: ProjectLoadEditorState<TTransparent>
    smartObjectBaseForRestore: ImageData | null
    paletteOrderIds: string[]
    methodProfilesByPaletteContext: ResolvedMethodProfilesByPaletteContext
    deConfettiByPaletteContext: ResolvedDeConfettiByPaletteContext
    quantizationProfile: QuantizationProfile
}

export type ProjectLoadAdapterOptions<TTransparent> = {
    transparentPixel: TTransparent
    paletteMin: number
    paletteMax: number
    defaultBrushSize: number
    defaultQuantizationProfile: QuantizationProfile
    resolveBuiltinQuantizationProfile: (
        id: string
    ) => QuantizationProfile | undefined
    cloneQuantizationProfile: (
        profile: QuantizationProfile
    ) => QuantizationProfile
}

function decodeProjectSnapshotRefToImageData(
    ref: ProjectSnapshotV2["ref"]
): ImageData | null {
    const bytes = decodeProjectSnapshotRefBytes(ref)
    if (!bytes) return null
    return new ImageData(bytes, 512, 512)
}

function resolveLoadedQuantizationProfile(
    validated: ValidatedSnapshotV2,
    options: Pick<
        ProjectLoadAdapterOptions<unknown>,
        "defaultQuantizationProfile" | "resolveBuiltinQuantizationProfile"
    >
): QuantizationProfile {
    return resolveProjectSnapshotV2QuantizationProfile(validated, {
        fallback: options.defaultQuantizationProfile,
        resolveBuiltin: (id) => {
            const builtin = options.resolveBuiltinQuantizationProfile(id)
            return builtin?.kind === "fixed" ? builtin : undefined
        },
    })
}

export function buildProjectLoadStateFromSnapshot<TTransparent>(
    validated: ValidatedSnapshotV2,
    options: ProjectLoadAdapterOptions<TTransparent>
): ProjectLoadNextState<TTransparent> {
    const runtimeLayers = buildProjectSnapshotV2RuntimeLayers(validated, {
        transparentPixel: options.transparentPixel,
        paletteMin: options.paletteMin,
        paletteMax: options.paletteMax,
    })

    const original = decodeProjectSnapshotRefToImageData(validated.ref)
    const hasOriginal = original != null
    const loadedAutoOverrides = runtimeLayers.autoOverrides
    const nextAutoEffective = applyProjectSnapshotV2AutoOverrides(
        runtimeLayers.autoSwatches,
        loadedAutoOverrides
    )
    const resolvedQuantizationProfile = resolveLoadedQuantizationProfile(
        validated,
        options
    )
    const resolvedMethodProfilesByPaletteContext =
        resolveProjectSnapshotV2MethodProfilesByPaletteContext(validated)
    const resolvedDeConfettiByPaletteContext =
        resolveProjectSnapshotV2DeConfettiByPaletteContext(validated)

    const project: ProjectLoadEditorState<TTransparent> = {
        gridSize: runtimeLayers.gridSize,
        paletteCount: runtimeLayers.paletteCount,
        brushSize: options.defaultBrushSize,
        imagePixels: runtimeLayers.imagePixels,
        overlayPixels: runtimeLayers.overlayPixels,
        showImage: hasOriginal,
        hasOriginalImageData: hasOriginal,
        autoSwatches: nextAutoEffective,
        userSwatches: runtimeLayers.userSwatches,
        selectedSwatch: runtimeLayers.selectedSwatch,
        methodProfilesByPaletteContext: {
            auto: { ...resolvedMethodProfilesByPaletteContext.auto },
            fixed: { ...resolvedMethodProfilesByPaletteContext.fixed },
        },
        deConfettiByPaletteContext: {
            auto: { ...resolvedDeConfettiByPaletteContext.auto },
            fixed: { ...resolvedDeConfettiByPaletteContext.fixed },
        },
        quantizationProfile: options.cloneQuantizationProfile(
            resolvedQuantizationProfile
        ),
        importedPalettePresets:
            resolvedQuantizationProfile.kind === "fixed" &&
            resolvedQuantizationProfile.source === "imported"
                ? [
                      {
                          id: resolvedQuantizationProfile.id,
                          name: resolvedQuantizationProfile.name,
                          profile: resolvedQuantizationProfile,
                      },
                  ]
                : [],
        autoOverrides: loadedAutoOverrides,
    }

    return {
        project,
        smartObjectBaseForRestore: original,
        paletteOrderIds: runtimeLayers.paletteOrderIds,
        methodProfilesByPaletteContext: resolvedMethodProfilesByPaletteContext,
        deConfettiByPaletteContext: resolvedDeConfettiByPaletteContext,
        quantizationProfile: resolvedQuantizationProfile,
    }
}
