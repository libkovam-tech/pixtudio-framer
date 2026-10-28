import type { CropDimensions, CropDrawGeometry, CropRasterPolicy } from "./cropRender.ts"
import type { EditorCommittedState } from "./editorHistoryState.ts"
import type { SmartReferenceAdjustments, SmartWhiteBalanceApplyInputs } from "./smartRender.ts"
import type { ManualGuide } from "./manualGuide.ts"

export type EditorCapabilities = Readonly<{
    drawing: boolean
    swatchMutation: boolean
    autoSwatchMutation: boolean
    builtinPresetSwatchMutation: boolean
    recorder: boolean
    projectFiles: boolean
    navigation: boolean
    export: boolean
    history: boolean
}>

export const STANDARD_EDITOR_CAPABILITIES: EditorCapabilities = Object.freeze({
    drawing: true,
    swatchMutation: true,
    autoSwatchMutation: true,
    builtinPresetSwatchMutation: true,
    recorder: true,
    projectFiles: true,
    navigation: true,
    export: true,
    history: true,
})

export const RESTRICTED_REFERENCE_CAPABILITIES: EditorCapabilities = Object.freeze({
    drawing: false,
    swatchMutation: false,
    autoSwatchMutation: false,
    builtinPresetSwatchMutation: false,
    recorder: false,
    projectFiles: false,
    navigation: false,
    export: false,
    history: true,
})

export type EditorCommitTap =
    | Readonly<{
          kind: "crop"
          sessionId: string
          drawGeometry: CropDrawGeometry
          referenceInputGeometry: CropDimensions
      }>
    | Readonly<{
          kind: "smart"
          sessionId: string
          adjustments: SmartReferenceAdjustments
          whiteBalance: SmartWhiteBalanceApplyInputs | null
      }>
    | Readonly<{
          kind: "editor"
          sessionId: string
          state: EditorCommittedState
      }>

export type EditorSessionStatus = Readonly<{
    sessionId: string
    settled: boolean
    cropOpen: boolean
}>

export type EditorHost = Readonly<{
    sessionId: string
    fullscreenPreviewEnabled?: boolean
    manualGuide?: ManualGuide
    initialImageFile?: File
    onInitialImageError?: (message: string) => void
    cropRasterPolicy?: CropRasterPolicy
    capabilities?: EditorCapabilities
    autoPaletteSnapshotPreset?: Readonly<{
        id: string
        name: string
        replacesBuiltinId: string
    }>
    onCommit?: (commit: EditorCommitTap) => void
    onStatus?: (status: EditorSessionStatus) => void
}>
