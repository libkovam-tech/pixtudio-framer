import type { EditorCommitTap, EditorSessionStatus } from "../../../editor/editorHost.ts"
import type { EditorCommittedState } from "../../../editor/editorHistoryState.ts"
import { resolveDeConfettiByPaletteContext, resolveMethodProfilesByPaletteContext, type QuantizationResult } from "../../../editor/QuantizationCore.ts"
import { resolveBuiltinQuantizationProfile, type QuantizationProfile } from "../../../editor/paletteQuantizationEngine.ts"
import type { CropDimensions, CropDrawGeometry } from "../../../editor/cropRender.ts"
import { ZERO_SMART_REFERENCE_ADJUSTMENTS } from "../../../editor/smartRender.ts"
import { captureDynamicAutoPalette, captureFinalPalette, type FinalPaletteRecipe } from "../render/finalPalette.ts"
import { freezeFinalFrame, type FinalFrameRecipe } from "../render/finalFrame.ts"
import type { ResolvedSmartRecipe } from "../render/smartRecipe.ts"

type EditorRecipe = Readonly<{
    grid: FinalFrameRecipe["grid"]
    palette: FinalPaletteRecipe
    paletteCount: number
}>

export type SealedReference = Readonly<{
    referenceInputGeometry: CropDimensions
    recipe: FinalFrameRecipe
}>

export class ReferenceNotReadyError extends Error {}

function activeProfile(state: EditorCommittedState): QuantizationProfile {
    const profile = state.quantizationProfile ?? { kind: "extract" }
    // The tab can lag behind native History; the committed profile owns matching.
    if (profile.kind === "fixed" && profile.source === "builtin") {
        const resolved = resolveBuiltinQuantizationProfile(profile.id)
        if (!resolved) throw new Error("Unknown built-in palette")
        return resolved
    }
    return profile
}

function captureEditorRecipe(state: EditorCommittedState): EditorRecipe {
    if (!state.hasOriginalImageData || !state.referenceSnapshot) {
        throw new Error("Reference import is not committed")
    }
    if (state.userSwatches.length || state.deletedAutoPaletteColors?.length ||
        Object.keys(state.autoOverrides).length ||
        state.overlayPixels.some(row => row.some(value => value !== null))) {
        throw new Error("Unsupported spatial or swatch mutation state")
    }
    if (state.imagePixels.length !== state.rows ||
        state.overlayPixels.length !== state.rows ||
        state.imagePixels.some(row => row.length !== state.columns) ||
        state.overlayPixels.some(row => row.length !== state.columns)) {
        throw new Error("Committed Grid and palette geometry differ")
    }
    const labels = new Set(state.autoSwatches.map(swatch => swatch.id))
    if (state.imagePixels.some(row => row.some(label => label !== null && !labels.has(label)))) {
        throw new Error("Committed palette has unresolved labels")
    }
    const profile = activeProfile(state)
    const context = profile.kind === "fixed" ? "fixed" : "auto"
    const methodProfile = resolveMethodProfilesByPaletteContext(
        state.methodProfilesByPaletteContext
    )[context]
    const deConfetti = resolveDeConfettiByPaletteContext(
        state.deConfettiByPaletteContext
    )[context]
    const world: QuantizationResult = {
        methodProfile,
        autoSwatches: state.autoSwatches,
        imagePixels: state.imagePixels,
        overlayPixels: state.overlayPixels,
        canvasPixels: state.imagePixels,
    }
    return {
        grid: {
            size: state.gridSize,
            columns: state.columns,
            rows: state.rows,
        },
        palette: captureFinalPalette(world, profile, deConfetti),
        paletteCount: state.paletteCount,
    }
}

const NEUTRAL_SMART: ResolvedSmartRecipe = Object.freeze({
    version: 1,
    adjustments: Object.freeze({
        exposure: ZERO_SMART_REFERENCE_ADJUSTMENTS.exposure,
        contrast: ZERO_SMART_REFERENCE_ADJUSTMENTS.contrast,
        saturation: ZERO_SMART_REFERENCE_ADJUSTMENTS.saturation,
        shadows: ZERO_SMART_REFERENCE_ADJUSTMENTS.shadows,
        midtones: ZERO_SMART_REFERENCE_ADJUSTMENTS.midtones,
        highlights: ZERO_SMART_REFERENCE_ADJUSTMENTS.highlights,
    }),
    whiteBalance: Object.freeze({ kind: "identity" }),
})

export class BatchReferenceEnvelope {
    readonly sessionId: string
    private crop: CropDrawGeometry | null = null
    private referenceInputGeometry: CropDimensions | null = null
    private smart: ResolvedSmartRecipe | null = null
    private editor: EditorRecipe | null = null
    private settled = false
    private invalidReason: string | null = null

    get isSettled(): boolean { return this.settled }
    constructor(sessionId: string) {
        this.sessionId = sessionId
    }

    accept(commit: EditorCommitTap): void {
        if (commit.sessionId !== this.sessionId) return
        switch (commit.kind) {
            case "crop":
                this.crop = structuredClone(commit.drawGeometry)
                this.referenceInputGeometry = structuredClone(commit.referenceInputGeometry)
                this.smart = NEUTRAL_SMART
                this.editor = null
                this.invalidReason = null
                this.settled = false
                return
            case "smart": {
                const a = commit.adjustments
                this.smart = {
                    version: 1,
                    adjustments: {
                        exposure: a.exposure,
                        contrast: a.contrast,
                        saturation: a.saturation,
                        shadows: a.shadows,
                        midtones: a.midtones,
                        highlights: a.highlights,
                    },
                    whiteBalance: commit.whiteBalance
                        ? { kind: "matrix", ...structuredClone(commit.whiteBalance) }
                        : { kind: "identity" },
                }
                return
            }
            case "editor":
                try {
                    this.editor = captureEditorRecipe(commit.state)
                    this.invalidReason = null
                } catch (error) {
                    this.editor = null
                    this.invalidReason = error instanceof Error ? error.message : "Invalid editor commit"
                }
                return
        }
    }

    updateStatus(status: EditorSessionStatus): void {
        if (status.sessionId === this.sessionId) this.settled = status.settled
    }

    seal(): SealedReference {
        if (!this.settled) throw new ReferenceNotReadyError("Editor session is not settled")
        if (this.invalidReason) throw new Error(this.invalidReason)
        if (!this.crop || !this.referenceInputGeometry || !this.smart || !this.editor) {
            throw new ReferenceNotReadyError("Reference recipe is incomplete")
        }
        if (![this.referenceInputGeometry.width, this.referenceInputGeometry.height]
            .every(value => Number.isSafeInteger(value) && value > 0)) {
            throw new Error("Invalid Reference Input Geometry")
        }
        const recipe = freezeFinalFrame({
            crop: this.crop,
            smart: this.smart,
            grid: this.editor.grid,
            palette: this.editor.palette.source === "auto"
                ? captureDynamicAutoPalette(this.editor.palette, this.editor.paletteCount)
                : this.editor.palette,
        })
        return Object.freeze({
            referenceInputGeometry: Object.freeze(structuredClone(this.referenceInputGeometry)),
            recipe,
        })
    }
}
